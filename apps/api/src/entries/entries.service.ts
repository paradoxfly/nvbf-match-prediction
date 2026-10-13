import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  ClaimView,
  EntryView,
  MyDayView,
  PredictionView,
  SubmitClaimInput,
} from '@predict/contracts';
import {
  and,
  desc,
  eq,
  entries,
  inArray,
  isNull,
  leaderboardRows,
  matchDays,
  matches,
  paymentClaims,
  predictions,
  type Database,
  type Executor,
} from '@predict/db';
import { entryCutoff, generatePaymentReference, lockAt } from '@predict/domain';
import { AuditService } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { enforceLimits, HOUR, MINUTE } from '../common/limits';
import { RateLimitService } from '../common/rate-limit.service';
import { isUniqueViolation } from '../common/pg-errors';
import { dayTiming, matchTiming, type DayRow } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { PublicService } from '../public/public.service';

export type EntryRow = typeof entries.$inferSelect;
type ClaimRow = typeof paymentClaims.$inferSelect;

export function claimView(row: ClaimRow): ClaimView {
  return {
    id: row.id,
    senderName: row.senderName,
    senderBank: row.senderBank,
    amountKobo: row.amountKobo,
    paidAt: row.paidAt,
    transferReference: row.transferReference,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

/** A player's entries: joining a day, telling us they paid, and their history. */
@Injectable()
export class EntriesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly publicService: PublicService,
    private readonly audit: AuditService,
    private readonly cache: TtlCache,
    private readonly limits: RateLimitService,
  ) {}

  async myDay(userId: string, date: string): Promise<MyDayView> {
    const day = await this.publicService.day(date);
    const [dayRow] = await this.db.select().from(matchDays).where(eq(matchDays.id, day.id));
    const [entry] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.userId, userId)));

    let picks: PredictionView[] = [];
    if (entry) {
      const rows = await this.db
        .select()
        .from(predictions)
        .where(eq(predictions.entryId, entry.id));
      const matchRows = await this.db.select().from(matches).where(eq(matches.matchDayId, day.id));
      const byId = new Map(matchRows.map((m) => [m.id, m]));
      picks = rows.map((row) => {
        const match = byId.get(row.matchId);
        const lock = match ? lockAt(matchTiming(match), dayTiming(dayRow!)) : null;
        return {
          matchId: row.matchId,
          sets: row.sets,
          homeSets: row.homeSets,
          awaySets: row.awaySets,
          savedAt: row.savedAt,
          counts:
            entry.status === 'confirmed' &&
            entry.creditedAt !== null &&
            lock !== null &&
            entry.creditedAt < lock &&
            row.savedAt < lock,
        };
      });
    }

    return {
      serverNow: day.serverNow,
      day,
      entry: entry ? await this.entryView(this.db, entry, date) : null,
      predictions: picks,
      collectionAccount: entry ? (dayRow?.collectionAccount ?? null) : null,
    };
  }

  /** Joins today's contest (idempotent: joining twice returns the same entry). */
  async join(userId: string, date: string): Promise<EntryView> {
    await enforceLimits(this.limits, [{ key: `join:${userId}`, limit: 30, windowSec: MINUTE }]);
    const day = await this.requireDay(date);
    const [existing] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.userId, userId)));
    if (existing) return this.entryView(this.db, existing, date);

    if (day.status !== 'open') throw new DomainError('DAY_NOT_OPEN');
    const matchRows = await this.db.select().from(matches).where(eq(matches.matchDayId, day.id));
    const cutoff = entryCutoff(dayTiming(day), matchRows.map(matchTiming));
    if (cutoff && cutoff <= new Date()) throw new DomainError('ENTRY_CLOSED');

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [created] = await this.db
          .insert(entries)
          .values({
            matchDayId: day.id,
            userId,
            paymentReference: generatePaymentReference((max) => randomInt(max)),
            feeKobo: day.entryFeeKobo,
            rulesHash: day.rulesHash ?? '',
          })
          .returning();
        await this.audit.record(
          null,
          { type: 'user', id: userId },
          {
            action: 'entry.created',
            targetType: 'entry',
            targetId: created!.id,
            metadata: { dayId: day.id },
          },
        );
        return this.entryView(this.db, created!, date);
      } catch (error) {
        if (isUniqueViolation(error, 'matchDayId_userId')) {
          // Joined twice at once: return the entry the other request created.
          const [entry] = await this.db
            .select()
            .from(entries)
            .where(and(eq(entries.matchDayId, day.id), eq(entries.userId, userId)));
          return this.entryView(this.db, entry!, date);
        }
        if (!isUniqueViolation(error, 'paymentReference')) throw error;
      }
    }
    throw new Error('Could not generate a unique payment reference');
  }

  /** "I've paid": moves the entry to review. A new note replaces any earlier pending one. */
  async submitClaim(userId: string, input: SubmitClaimInput): Promise<EntryView> {
    await enforceLimits(this.limits, [{ key: `claim:${userId}`, limit: 10, windowSec: HOUR }]);
    const entry = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(entries)
        .where(and(eq(entries.id, input.id), eq(entries.userId, userId)))
        .for('update');
      if (!row) throw new DomainError('NOT_FOUND');
      if (row.status === 'confirmed') throw new DomainError('ALREADY_CONFIRMED');
      if (row.status !== 'awaiting_payment' && row.status !== 'payment_review') {
        throw new DomainError('ENTRY_CLOSED');
      }
      const [day] = await tx.select().from(matchDays).where(eq(matchDays.id, row.matchDayId));
      if (!day || (day.status !== 'open' && day.status !== 'closed')) {
        throw new DomainError('ENTRY_CLOSED');
      }
      await tx
        .update(paymentClaims)
        .set({ status: 'rejected', reviewNote: 'Replaced by a newer note from the player.' })
        .where(and(eq(paymentClaims.entryId, row.id), eq(paymentClaims.status, 'pending')));
      await tx.insert(paymentClaims).values({
        entryId: row.id,
        senderName: input.senderName,
        senderBank: input.senderBank ?? null,
        amountKobo: input.amountKobo,
        paidAt: input.paidAt,
        transferReference: input.transferReference ?? null,
      });
      const [updated] = await tx
        .update(entries)
        .set({ status: 'payment_review' })
        .where(eq(entries.id, row.id))
        .returning();
      await this.audit.record(
        tx,
        { type: 'user', id: userId },
        {
          action: 'entry.claim_submitted',
          targetType: 'entry',
          targetId: row.id,
          metadata: { amountKobo: input.amountKobo },
        },
      );
      return { row: updated!, date: day.date };
    });
    this.cache.invalidate('public:');
    return this.entryView(this.db, entry.row, entry.date);
  }

  async myEntries(userId: string) {
    const rows = await this.db
      .select({ entry: entries, day: matchDays })
      .from(entries)
      .innerJoin(matchDays, eq(matchDays.id, entries.matchDayId))
      .where(eq(entries.userId, userId))
      .orderBy(desc(matchDays.date));
    const ids = rows.map((row) => row.entry.id);
    const results = ids.length
      ? await this.db
          .select()
          .from(leaderboardRows)
          .where(and(inArray(leaderboardRows.entryId, ids), isNull(leaderboardRows.supersededAt)))
      : [];
    const byEntry = new Map(results.map((row) => [row.entryId, row]));
    return Promise.all(
      rows.map(async ({ entry, day }) => {
        const result = byEntry.get(entry.id);
        return {
          ...(await this.entryView(this.db, entry, day.date)),
          dayTitle: day.title,
          dayStatus: day.status,
          rank: result?.rank ?? null,
          points: result?.points ?? null,
          prizeKobo: result ? result.prizeKobo : null,
        };
      }),
    );
  }

  async entryView(executor: Executor, entry: EntryRow, date: string): Promise<EntryView> {
    const [claim] = await executor
      .select()
      .from(paymentClaims)
      .where(eq(paymentClaims.entryId, entry.id))
      .orderBy(desc(paymentClaims.createdAt))
      .limit(1);
    return {
      id: entry.id,
      dayId: entry.matchDayId,
      date,
      status: entry.status,
      paymentReference: entry.paymentReference,
      feeKobo: entry.feeKobo,
      creditedAt: entry.creditedAt,
      confirmedAt: entry.confirmedAt,
      disqualified: entry.disqualifiedAt !== null,
      latestClaim: claim ? claimView(claim) : null,
      createdAt: entry.createdAt,
    };
  }

  private async requireDay(date: string): Promise<DayRow> {
    const league = await this.publicService.currentLeague();
    if (!league) throw new DomainError('NOT_FOUND');
    const [day] = await this.db
      .select()
      .from(matchDays)
      .where(and(eq(matchDays.leagueId, league.id), eq(matchDays.date, date)));
    if (!day || day.status === 'draft') throw new DomainError('NOT_FOUND');
    return day;
  }
}
