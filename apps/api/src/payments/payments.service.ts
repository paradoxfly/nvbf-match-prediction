import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import type { BankPaymentView, BankTransferInput, PaymentQueueItem } from '@predict/contracts';
import {
  and,
  count,
  desc,
  eq,
  entries,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  matchDays,
  matches,
  or,
  paymentClaims,
  payoutObligations,
  prizeContributions,
  sql,
  users,
  bankPayments,
  type Database,
  type Executor,
} from '@predict/db';
import { computePool, entryCutoff, formatNaira, normalizePaymentReference } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { dayTiming, matchTiming, type DayRow } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { claimView, type EntryRow } from '../entries/entries.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettingsService } from '../setup/settings.service';
import { SmsService } from '../sms/sms.service';

type BankPaymentRow = typeof bankPayments.$inferSelect;

/** Bank references are compared without spaces and case, so the same transfer can't sneak in twice. */
export const normalizeBankReference = (value: string | undefined | null) => {
  const cleaned = (value ?? '').replace(/\s+/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Staff payment reconciliation against the real bank statement. Every change locks the day
 * row, then the transfer row, then the entry, always in that order, so concurrent confirmations
 * and finalization can never interleave.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly sms: SmsService,
    private readonly cache: TtlCache,
  ) {}

  async queue(query: {
    page: number;
    pageSize: number;
    dayId?: string;
    status?: EntryRow['status'];
    q?: string;
  }) {
    const search = query.q?.trim();
    const reference = search ? normalizePaymentReference(search) : null;
    const where = and(
      query.dayId ? eq(entries.matchDayId, query.dayId) : undefined,
      query.status ? eq(entries.status, query.status) : undefined,
      search
        ? or(
            eq(entries.paymentReference, reference ?? search),
            ilike(users.displayName, `%${search}%`),
            ilike(users.phone, `%${search.replace(/^0/, '')}%`),
            sql`exists (select 1 from ${paymentClaims} pc where pc.entry_id = ${entries.id} and pc.sender_name ilike ${`%${search}%`})`,
          )
        : undefined,
    );
    const [total] = await this.db
      .select({ n: count() })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.userId))
      .where(where);
    const rows = await this.db
      .select({ entry: entries })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.userId))
      .where(where)
      // Oldest claims first: they've waited longest.
      .orderBy(sql`${entries.status} = 'payment_review' desc`, entries.updatedAt)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    return {
      items: await this.items(rows.map((row) => row.entry)),
      page: query.page,
      pageSize: query.pageSize,
      total: total?.n ?? 0,
    };
  }

  /**
   * Records the transfer (or reuses the record with the same bank reference) and applies the
   * entry fee from it. Idempotent: confirming again with the same transfer is a no-op.
   */
  async confirm(actor: Actor, entryId: string, transfer: BankTransferInput) {
    const warnings: string[] = [];
    const result = await this.db.transaction(async (tx) => {
      const entry0 = await this.requireEntry(tx, entryId);
      const day = await this.lockDay(tx, entry0.matchDayId);
      if (day.status !== 'open' && day.status !== 'closed') throw new DomainError('BAD_STATUS');

      const payment = await this.findOrCreateTransfer(tx, actor, transfer, warnings);
      const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId)).for('update');
      if (!entry) throw new DomainError('NOT_FOUND');

      if (entry.status === 'confirmed') {
        if (entry.bankPaymentId === payment.id) return { entry, payment, changed: false };
        throw new DomainError('ALREADY_CONFIRMED');
      }
      if (entry.status !== 'awaiting_payment' && entry.status !== 'payment_review') {
        throw new DomainError('BAD_STATUS');
      }

      const matchRows = await tx.select().from(matches).where(eq(matches.matchDayId, day.id));
      const cutoff = entryCutoff(dayTiming(day), matchRows.map(matchTiming));
      if (cutoff && payment.creditedAt > cutoff) throw new DomainError('LATE_PAYMENT');

      const unapplied = await this.unapplied(tx, payment);
      if (unapplied < entry.feeKobo) {
        throw new DomainError('INSUFFICIENT_FUNDS', {
          unappliedKobo: unapplied,
          feeKobo: entry.feeKobo,
        });
      }

      const [confirmed] = await tx
        .update(entries)
        .set({
          status: 'confirmed',
          bankPaymentId: payment.id,
          creditedAt: payment.creditedAt,
          confirmedAt: new Date(),
          confirmedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(
          and(
            eq(entries.id, entry.id),
            inArray(entries.status, ['awaiting_payment', 'payment_review']),
          ),
        )
        .returning();
      await tx
        .update(paymentClaims)
        .set({
          status: 'accepted',
          reviewedAt: new Date(),
          reviewedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(and(eq(paymentClaims.entryId, entry.id), eq(paymentClaims.status, 'pending')));

      const n = (await this.ledger.countEvents(tx, `entry_confirmed:${entry.id}:`)) + 1;
      await this.ledger.post(tx, actor, {
        eventKey: `entry_confirmed:${entry.id}:${n}`,
        legs: [{ account: 'collections', amountKobo: entry.feeKobo }],
        dayId: day.id,
        refType: 'entry',
        refId: entry.id,
      });
      await this.bumpScoring(tx, day.id);
      await this.audit.record(tx, actor, {
        action: 'entry.confirmed',
        targetType: 'entry',
        targetId: entry.id,
        metadata: { bankPaymentId: payment.id, creditedAt: payment.creditedAt },
      });

      const settings = await this.settings.row(tx);
      if (settings.smsOnPaymentConfirmed) {
        const [user] = await tx.select().from(users).where(eq(users.id, entry.userId));
        if (user) {
          await this.sms.queue(
            tx,
            user.phone,
            `${product.name}: your ${formatNaira(entry.feeKobo)} entry for ${day.date} is confirmed. Good luck!`,
            'notice',
            user.id,
          );
        }
      }
      return { entry: confirmed!, payment, changed: true };
    });
    if (result.changed) this.cache.invalidate('public:');
    const [item] = await this.items([result.entry]);
    return { entry: item!, transfer: await this.transferView(this.db, result.payment), warnings };
  }

  async rejectClaim(actor: Actor, entryId: string, reason: string): Promise<PaymentQueueItem> {
    const entry = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(entries).where(eq(entries.id, entryId)).for('update');
      if (!row) throw new DomainError('NOT_FOUND');
      if (row.status !== 'payment_review') throw new DomainError('BAD_STATUS');
      await tx
        .update(paymentClaims)
        .set({
          status: 'rejected',
          reviewNote: reason,
          reviewedAt: new Date(),
          reviewedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(and(eq(paymentClaims.entryId, row.id), eq(paymentClaims.status, 'pending')));
      const [updated] = await tx
        .update(entries)
        .set({ status: 'awaiting_payment' })
        .where(and(eq(entries.id, row.id), eq(entries.status, 'payment_review')))
        .returning();
      await this.audit.record(tx, actor, {
        action: 'entry.claim_rejected',
        targetType: 'entry',
        targetId: row.id,
        reason,
      });
      return updated!;
    });
    const [item] = await this.items([entry]);
    return item!;
  }

  /**
   * Undoes a mistaken confirmation before the day is final. The money goes back to "unused" on
   * its transfer, and the operator tops the pool up by exactly what it would have lost.
   */
  async revoke(actor: Actor, entryId: string, reason: string): Promise<PaymentQueueItem> {
    const entry = await this.db.transaction(async (tx) => {
      const entry0 = await this.requireEntry(tx, entryId);
      const day = await this.lockDay(tx, entry0.matchDayId);
      if (day.status !== 'open' && day.status !== 'closed') throw new DomainError('BAD_STATUS');
      const [row] = await tx.select().from(entries).where(eq(entries.id, entryId)).for('update');
      if (!row || row.status !== 'confirmed') throw new DomainError('BAD_STATUS');

      const before = await this.livePool(tx, day);
      const [updated] = await tx
        .update(entries)
        .set({
          status: 'awaiting_payment',
          bankPaymentId: null,
          creditedAt: null,
          confirmedAt: null,
          confirmedByAdminId: null,
        })
        .where(and(eq(entries.id, row.id), eq(entries.status, 'confirmed')))
        .returning();
      const after = await this.livePool(tx, day);
      const n = (await this.ledger.countEvents(tx, `entry_revoked:${row.id}:`)) + 1;
      await this.ledger.post(tx, actor, {
        eventKey: `entry_revoked:${row.id}:${n}`,
        legs: [{ account: 'collections', amountKobo: -row.feeKobo }],
        dayId: day.id,
        refType: 'entry',
        refId: row.id,
        memo: reason,
      });

      const topUp = before - after;
      if (topUp > 0) {
        const [contribution] = await tx
          .insert(prizeContributions)
          .values({
            source: 'operator',
            status: 'allocated',
            matchDayId: day.id,
            amountKobo: topUp,
            note: `Top-up so the pool doesn't shrink after revoking entry ${row.paymentReference}.`,
            receivedAt: new Date(),
            allocatedAt: new Date(),
            createdByAdminId: actor.type === 'admin' ? actor.id : null,
          })
          .returning();
        await this.ledger.post(tx, actor, {
          eventKey: `contribution_allocated:${contribution!.id}`,
          legs: [{ account: 'contributions', amountKobo: topUp }],
          dayId: day.id,
          refType: 'prize_contribution',
          refId: contribution!.id,
        });
      }
      await this.bumpScoring(tx, day.id);
      await this.audit.record(tx, actor, {
        action: 'entry.revoked',
        targetType: 'entry',
        targetId: row.id,
        reason,
        metadata: { bankPaymentId: row.bankPaymentId, operatorTopUpKobo: Math.max(topUp, 0) },
      });
      return updated!;
    });
    this.cache.invalidate('public:');
    const [item] = await this.items([entry]);
    return item!;
  }

  /** Removes a duplicate account's entry from the ranking. Its fee stays in the pool. */
  async disqualify(actor: Actor, entryId: string, reason: string, undo: boolean) {
    const entry = await this.db.transaction(async (tx) => {
      const entry0 = await this.requireEntry(tx, entryId);
      const day = await this.lockDay(tx, entry0.matchDayId);
      if (day.status === 'finalized' || day.status === 'completed' || day.status === 'cancelled') {
        throw new DomainError('BAD_STATUS');
      }
      const [updated] = await tx
        .update(entries)
        .set(
          undo
            ? { disqualifiedAt: null, disqualifiedReason: null, disqualifiedByAdminId: null }
            : {
                disqualifiedAt: entry0.disqualifiedAt ?? new Date(),
                disqualifiedReason: reason,
                disqualifiedByAdminId: actor.type === 'admin' ? actor.id : null,
              },
        )
        .where(eq(entries.id, entryId))
        .returning();
      await this.bumpScoring(tx, day.id);
      await this.audit.record(tx, actor, {
        action: undo ? 'entry.reinstated' : 'entry.disqualified',
        targetType: 'entry',
        targetId: entryId,
        reason,
      });
      return updated!;
    });
    const [item] = await this.items([entry]);
    return item!;
  }

  async transfers(query: { page: number; pageSize: number; unappliedOnly?: boolean; q?: string }) {
    const search = query.q?.trim();
    const where = search
      ? or(
          eq(bankPayments.bankReference, normalizeBankReference(search) ?? ''),
          ilike(bankPayments.senderName, `%${search}%`),
          ilike(bankPayments.narration, `%${search}%`),
        )
      : undefined;
    const rows = await this.db
      .select()
      .from(bankPayments)
      .where(where)
      .orderBy(desc(bankPayments.creditedAt))
      .limit(500);
    let views = await Promise.all(rows.map((row) => this.transferView(this.db, row)));
    if (query.unappliedOnly) views = views.filter((view) => view.unappliedKobo > 0 && !view.voided);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: views.slice(start, start + query.pageSize),
      page: query.page,
      pageSize: query.pageSize,
      total: views.length,
    };
  }

  /** Records money that arrived without confirming any entry (it shows as unused until applied or refunded). */
  async recordTransfer(actor: Actor, input: BankTransferInput) {
    const warnings: string[] = [];
    const payment = await this.db.transaction((tx) =>
      this.findOrCreateTransfer(tx, actor, input, warnings),
    );
    return { transfer: await this.transferView(this.db, payment), warnings };
  }

  async voidTransfer(actor: Actor, id: string, reason: string): Promise<BankPaymentView> {
    const payment = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(bankPayments)
        .where(eq(bankPayments.id, id))
        .for('update');
      if (!row) throw new DomainError('NOT_FOUND');
      if (row.voidedAt) return row;
      const view = await this.transferView(tx, row);
      if (view.appliedKobo > 0 || view.refundedKobo > 0) throw new DomainError('IN_USE');
      const [updated] = await tx
        .update(bankPayments)
        .set({
          voidedAt: new Date(),
          voidReason: reason,
          voidedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(eq(bankPayments.id, id))
        .returning();
      await this.audit.record(tx, actor, {
        action: 'bank_payment.voided',
        targetType: 'bank_payment',
        targetId: id,
        reason,
      });
      return updated!;
    });
    return this.transferView(this.db, payment);
  }

  /** Money on a transfer not yet used for an entry fee or a refund. */
  async unapplied(executor: Executor, payment: BankPaymentRow): Promise<number> {
    const view = await this.transferView(executor, payment);
    return view.voided ? 0 : view.unappliedKobo;
  }

  async transferView(executor: Executor, payment: BankPaymentRow): Promise<BankPaymentView> {
    const applied = await executor
      .select({
        id: entries.id,
        fee: entries.feeKobo,
        reference: entries.paymentReference,
        date: matchDays.date,
      })
      .from(entries)
      .innerJoin(matchDays, eq(matchDays.id, entries.matchDayId))
      .where(
        and(
          eq(entries.bankPaymentId, payment.id),
          inArray(entries.status, ['confirmed', 'refunded']),
        ),
      );
    const [refunds] = await executor
      .select({ total: sql<string | null>`sum(${payoutObligations.amountKobo})` })
      .from(payoutObligations)
      .where(
        and(
          eq(payoutObligations.bankPaymentId, payment.id),
          eq(payoutObligations.kind, 'refund'),
          isNull(payoutObligations.supersededAt),
        ),
      );
    const appliedKobo = applied.reduce((total, row) => total + row.fee, 0);
    const refundedKobo = Number(refunds?.total ?? 0);
    return {
      id: payment.id,
      bankReference: payment.bankReference,
      amountKobo: payment.amountKobo,
      appliedKobo,
      refundedKobo,
      unappliedKobo: Math.max(0, payment.amountKobo - appliedKobo - refundedKobo),
      creditedAt: payment.creditedAt,
      senderName: payment.senderName,
      narration: payment.narration,
      note: payment.note,
      voided: payment.voidedAt !== null,
      entries: applied.map((row) => ({
        id: row.id,
        paymentReference: row.reference,
        date: row.date,
      })),
      createdAt: payment.createdAt,
    };
  }

  /** Queue rows with the player and their latest note. */
  async items(rows: EntryRow[]): Promise<PaymentQueueItem[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [people, days, claims] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(inArray(users.id, [...new Set(rows.map((r) => r.userId))])),
      this.db
        .select()
        .from(matchDays)
        .where(inArray(matchDays.id, [...new Set(rows.map((r) => r.matchDayId))])),
      this.db
        .select()
        .from(paymentClaims)
        .where(inArray(paymentClaims.entryId, ids))
        .orderBy(desc(paymentClaims.createdAt)),
    ]);
    return rows.map((row) => {
      const user = people.find((u) => u.id === row.userId)!;
      const day = days.find((d) => d.id === row.matchDayId)!;
      const claim = claims.find((c) => c.entryId === row.id);
      return {
        entryId: row.id,
        paymentReference: row.paymentReference,
        status: row.status,
        feeKobo: row.feeKobo,
        createdAt: row.createdAt,
        confirmedAt: row.confirmedAt,
        disqualified: row.disqualifiedAt !== null,
        user: { id: user.id, displayName: user.displayName, phone: user.phone },
        day: { id: day.id, date: day.date, status: day.status },
        latestClaim: claim ? claimView(claim) : null,
        bankPaymentId: row.bankPaymentId,
      };
    });
  }

  private async findOrCreateTransfer(
    tx: Executor,
    actor: Actor,
    input: BankTransferInput,
    warnings: string[],
  ): Promise<BankPaymentRow> {
    const reference = normalizeBankReference(input.bankReference);
    if (!reference && !input.note) throw new DomainError('CASH_NEEDS_NOTE');
    // A typo here would silently change which picks count, so the future is refused.
    if (input.creditedAt.getTime() > Date.now() + 5 * 60_000) {
      throw new DomainError('CREDITED_IN_FUTURE');
    }
    if (reference) {
      const [existing] = await tx
        .select()
        .from(bankPayments)
        .where(eq(bankPayments.bankReference, reference))
        .for('update');
      if (existing) {
        if (existing.voidedAt) throw new DomainError('TRANSFER_VOIDED');
        if (
          existing.amountKobo !== input.amountKobo ||
          Math.abs(existing.creditedAt.getTime() - input.creditedAt.getTime()) > 60_000
        ) {
          throw new DomainError('TRANSFER_MISMATCH');
        }
        return existing;
      }
    }

    // Same amount from the same sender within 15 minutes: possibly one transfer typed twice.
    if (input.senderName) {
      const window = 15 * 60_000;
      const similar = await tx
        .select({ id: bankPayments.id })
        .from(bankPayments)
        .where(
          and(
            eq(bankPayments.amountKobo, input.amountKobo),
            ilike(bankPayments.senderName, input.senderName),
            gte(bankPayments.creditedAt, new Date(input.creditedAt.getTime() - window)),
            lte(bankPayments.creditedAt, new Date(input.creditedAt.getTime() + window)),
            isNull(bankPayments.voidedAt),
          ),
        );
      if (similar.length > 0) {
        warnings.push(
          `A transfer of ${formatNaira(input.amountKobo)} from ${input.senderName} within 15 minutes is already recorded. Check it isn't the same one.`,
        );
      }
    }

    const [created] = await tx
      .insert(bankPayments)
      .values({
        bankReference: reference,
        amountKobo: input.amountKobo,
        creditedAt: input.creditedAt,
        senderName: input.senderName ?? null,
        narration: input.narration ?? null,
        note: input.note ?? null,
        recordedByAdminId: actor.type === 'admin' ? actor.id : (null as unknown as string),
      })
      .returning();
    await this.audit.record(tx, actor, {
      action: 'bank_payment.recorded',
      targetType: 'bank_payment',
      targetId: created!.id,
      after: {
        bankReference: reference,
        amountKobo: input.amountKobo,
        creditedAt: input.creditedAt,
        senderName: input.senderName ?? null,
      },
    });
    return created!;
  }

  /** The day's prize pool right now, from confirmed entries and allocated contributions. */
  private async livePool(tx: Executor, day: DayRow): Promise<number> {
    const [confirmed] = await tx
      .select({ n: count() })
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.status, 'confirmed')));
    const [extra] = await tx
      .select({ total: sql<string | null>`sum(${prizeContributions.amountKobo})` })
      .from(prizeContributions)
      .where(
        and(eq(prizeContributions.matchDayId, day.id), eq(prizeContributions.status, 'allocated')),
      );
    return computePool({
      confirmedCount: confirmed?.n ?? 0,
      entryFeeKobo: day.entryFeeKobo,
      prizeBps: day.prizeBps,
      jackpotBps: day.jackpotBps,
      contributionsKobo: Number(extra?.total ?? 0),
    }).dailyPoolKobo;
  }

  private async requireEntry(tx: Executor, id: string): Promise<EntryRow> {
    const [entry] = await tx.select().from(entries).where(eq(entries.id, id));
    if (!entry) throw new DomainError('NOT_FOUND');
    return entry;
  }

  /** Locks the day row first: the fixed lock order that keeps money changes serialised per day. */
  private async lockDay(tx: Executor, dayId: string): Promise<DayRow> {
    const [day] = await tx.select().from(matchDays).where(eq(matchDays.id, dayId)).for('update');
    if (!day) throw new DomainError('NOT_FOUND');
    return day;
  }

  private async bumpScoring(tx: Executor, dayId: string) {
    await tx
      .update(matchDays)
      .set({ scoringRev: sql`${matchDays.scoringRev} + 1` })
      .where(eq(matchDays.id, dayId));
  }
}
