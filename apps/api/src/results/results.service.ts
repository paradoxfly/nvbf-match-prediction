import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminLeaderboard,
  AdminRole,
  EnterResultInput,
  ResultVersionView,
} from '@predict/contracts';
import {
  adminUsers,
  and,
  count,
  desc,
  eq,
  entries,
  inArray,
  isNull,
  leaderboardRows,
  ledgerEntries,
  matchDays,
  matches,
  matchResults,
  payoutAttempts,
  payoutObligations,
  prizeContributions,
  sql,
  users,
  type Database,
  type Executor,
} from '@predict/db';
import { ordinal, summarizeSetLine, validateSetLine } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import type { DayRow } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { LedgerService, type LedgerAccount } from '../ledger/ledger.service';
import { ObligationsService } from '../payouts/obligations.service';
import { DaysService } from '../setup/days.service';
import { EmailService } from '../email/email.service';
import { dayCancelledEmail, prizeWonEmail } from '../email/messages';
import { LeaderboardService, toRow, type ComputedLeaderboard } from './leaderboard.service';

/** Results entry, the staff leaderboard, and closing a day out (finalize, reopen, cancel). */
@Injectable()
export class ResultsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly leaderboard: LeaderboardService,
    private readonly days: DaysService,
    private readonly obligations: ObligationsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly cache: TtlCache,
  ) {}

  async versions(matchId: string): Promise<ResultVersionView[]> {
    const rows = await this.db
      .select()
      .from(matchResults)
      .where(eq(matchResults.matchId, matchId))
      .orderBy(desc(matchResults.version));
    const adminIds = [
      ...new Set(rows.flatMap((r) => [r.enteredByAdminId, r.confirmedByAdminId]).filter(Boolean)),
    ] as string[];
    const admins = adminIds.length
      ? await this.db.select().from(adminUsers).where(inArray(adminUsers.id, adminIds))
      : [];
    const name = (id: string | null) =>
      id ? (admins.find((a) => a.id === id)?.name ?? 'Staff') : null;
    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      sets: row.sets,
      homeSets: row.homeSets,
      awaySets: row.awaySets,
      status: row.status,
      nonStandardReason: row.nonStandardReason,
      note: row.note,
      enteredBy: name(row.enteredByAdminId) ?? 'Staff',
      confirmedBy: name(row.confirmedByAdminId),
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
    }));
  }

  /** Enters a result (or a correction). It changes nothing for players until confirmed. */
  async enter(actor: Actor, role: AdminRole, input: EnterResultInput) {
    const dayId = await this.db.transaction(async (tx) => {
      const { day, match } = await this.lockMatch(tx, input.id);
      if (day.status !== 'open' && day.status !== 'closed') throw new DomainError('BAD_STATUS');
      if (match.status === 'void') throw new DomainError('BAD_STATUS');

      const validation = validateSetLine(input.sets, day.format);
      let homeSets: number;
      let awaySets: number;
      if (validation.ok) {
        ({ homeSets, awaySets } = validation.summary.major);
      } else {
        if (!input.nonStandardReason) {
          throw new DomainError('INVALID_RESULT', {
            issues: validation.issues.map((i) => i.message),
          });
        }
        const summary = (() => {
          try {
            return summarizeSetLine(input.sets);
          } catch {
            return null;
          }
        })();
        if (!summary)
          throw new DomainError('INVALID_RESULT', { issues: ['A result needs a winner.'] });
        ({ homeSets, awaySets } = summary.major);
      }

      const [confirmed] = await tx
        .select()
        .from(matchResults)
        .where(and(eq(matchResults.matchId, match.id), eq(matchResults.status, 'confirmed')));
      if (confirmed) {
        if (role !== 'super_admin') {
          throw new DomainError('FORBIDDEN', {
            message: 'Only a super admin can correct a confirmed result.',
          });
        }
        if (!input.correctionReason) throw new DomainError('CORRECTION_NEEDS_REASON');
      }
      await tx
        .update(matchResults)
        .set({ status: 'superseded', supersededAt: new Date() })
        .where(and(eq(matchResults.matchId, match.id), eq(matchResults.status, 'provisional')));
      const [latest] = await tx
        .select({ version: matchResults.version })
        .from(matchResults)
        .where(eq(matchResults.matchId, match.id))
        .orderBy(desc(matchResults.version))
        .limit(1);
      await tx.insert(matchResults).values({
        matchId: match.id,
        version: (latest?.version ?? 0) + 1,
        sets: input.sets.map((set) => ({ home: set.home, away: set.away })),
        homeSets,
        awaySets,
        status: 'provisional',
        nonStandardReason: validation.ok ? null : (input.nonStandardReason ?? null),
        note:
          [input.note, input.correctionReason && `Correction: ${input.correctionReason}`]
            .filter(Boolean)
            .join(' · ') || null,
        enteredByAdminId: this.adminId(actor),
      });
      await this.audit.record(tx, actor, {
        action: confirmed ? 'result.correction_entered' : 'result.entered',
        targetType: 'match',
        targetId: match.id,
        reason: input.correctionReason ?? input.nonStandardReason ?? null,
        after: { sets: input.sets, homeSets, awaySets },
      });
      return day.id;
    });
    return this.days.get(dayId);
  }

  /** Confirms the latest entered result; only now does it count on the leaderboard. */
  async confirm(actor: Actor, role: AdminRole, matchId: string) {
    const dayId = await this.db.transaction(async (tx) => {
      const { day, match } = await this.lockMatch(tx, matchId);
      if (day.status !== 'open' && day.status !== 'closed') throw new DomainError('BAD_STATUS');
      const [pending] = await tx
        .select()
        .from(matchResults)
        .where(and(eq(matchResults.matchId, match.id), eq(matchResults.status, 'provisional')))
        .orderBy(desc(matchResults.version))
        .limit(1);
      if (!pending) throw new DomainError('NOTHING_TO_CONFIRM');
      const [previous] = await tx
        .select()
        .from(matchResults)
        .where(and(eq(matchResults.matchId, match.id), eq(matchResults.status, 'confirmed')));
      if (previous) {
        if (role !== 'super_admin') {
          throw new DomainError('FORBIDDEN', {
            message: 'Only a super admin can correct a confirmed result.',
          });
        }
        await tx
          .update(matchResults)
          .set({ status: 'superseded', supersededAt: new Date() })
          .where(eq(matchResults.id, previous.id));
      }
      await tx
        .update(matchResults)
        .set({
          status: 'confirmed',
          confirmedAt: new Date(),
          confirmedByAdminId: this.adminId(actor),
        })
        .where(eq(matchResults.id, pending.id));
      await tx.update(matches).set({ status: 'final' }).where(eq(matches.id, match.id));
      await this.bumpScoring(tx, day.id);
      await this.audit.record(tx, actor, {
        action: previous ? 'result.correction_confirmed' : 'result.confirmed',
        targetType: 'match',
        targetId: match.id,
        before: previous ? { sets: previous.sets } : null,
        after: { sets: pending.sets },
      });
      return day.id;
    });
    this.cache.invalidate('public:');
    return this.days.get(dayId);
  }

  // -------------------------------------------------------------------------------------------

  async adminLeaderboard(dayId: string): Promise<AdminLeaderboard> {
    const day = await this.requireDay(this.db, dayId);
    const dayView = await this.days.get(dayId);
    if (day.finalizedAt) {
      const rows = await this.db
        .select()
        .from(leaderboardRows)
        .where(and(eq(leaderboardRows.matchDayId, dayId), isNull(leaderboardRows.supersededAt)))
        .orderBy(leaderboardRows.rank);
      const awarded = rows.reduce((total, row) => total + row.prizeKobo, 0);
      return {
        day: dayView,
        rows: rows.map((row) => ({
          rank: row.rank,
          tied: row.groupSize > 1,
          displayName: row.displayName,
          points: row.points,
          closeness: row.closeness,
          exactCount: row.exactCount,
          winnerCount: row.winnerCount,
          prizeKobo: row.prizeKobo > 0 ? row.prizeKobo : null,
          entryId: row.entryId,
          userId: row.userId,
          countedPredictions: row.countedPredictions,
        })),
        unranked: [],
        check: { canFinalize: false, blockers: ['This day is already final.'], warnings: [] },
        allocation: {
          dailyPoolKobo: day.finalDailyPoolKobo ?? 0,
          awardedKobo: awarded,
          roundingKobo: day.finalRoundingKobo ?? 0,
          jackpotCutKobo: day.finalJackpotCutKobo ?? 0,
        },
      };
    }
    const board = await this.leaderboard.compute(day);
    const check = await this.finalizeCheck(this.db, day, board);
    return {
      day: dayView,
      rows: board.rows.map((row) => ({
        ...toRow(row.displayName, row.ranked, row.prizeKobo),
        entryId: row.entryId,
        userId: row.userId,
        countedPredictions: row.ranked.score.countedPredictions,
      })),
      unranked: board.unranked.map((u) => ({
        entryId: u.entryId,
        displayName: u.displayName,
        reason: u.reason,
      })),
      check,
      allocation: {
        dailyPoolKobo: board.pool.dailyPoolKobo,
        awardedKobo: board.allocation.awards.reduce((t, a) => t + a.amountKobo, 0),
        roundingKobo: board.allocation.roundingToOpsKobo,
        jackpotCutKobo: board.pool.jackpotCutKobo,
      },
    };
  }

  /**
   * Freezes the day: the pool, the final leaderboard, every prize owed and the jackpot share,
   * in one transaction with the day row locked (no confirmation can slip in halfway).
   */
  async finalize(
    actor: Actor,
    dayId: string,
    acknowledgeWarnings: boolean,
  ): Promise<AdminLeaderboard> {
    await this.db.transaction(async (tx) => {
      const day = await this.requireDay(tx, dayId, true);
      if (day.status === 'finalized' || day.status === 'completed') return;
      const board = await this.leaderboard.compute(day, tx);
      const check = await this.finalizeCheck(tx, day, board);
      if (check.blockers.length > 0)
        throw new DomainError('NOT_READY', { blockers: check.blockers });
      if (check.warnings.length > 0 && !acknowledgeWarnings) {
        throw new DomainError('NOT_READY', { blockers: check.warnings });
      }

      // Entries that never got a confirmed payment don't count from here on.
      await tx
        .update(entries)
        .set({ status: 'expired' })
        .where(
          and(
            eq(entries.matchDayId, dayId),
            inArray(entries.status, ['awaiting_payment', 'payment_review']),
          ),
        );

      const version = day.finalizeVersion + 1;
      const { pool, allocation } = board;
      const awardedKobo = allocation.awards.reduce((total, award) => total + award.amountKobo, 0);
      if (board.rows.length > 0) {
        await tx.insert(leaderboardRows).values(
          board.rows.map((row) => ({
            matchDayId: dayId,
            entryId: row.entryId,
            userId: row.userId,
            displayName: row.displayName,
            points: row.ranked.score.points,
            closeness: row.ranked.score.closeness,
            exactCount: row.ranked.score.exactCount,
            winnerCount: row.ranked.score.winnerCount,
            countedPredictions: row.ranked.score.countedPredictions,
            rank: row.ranked.rank,
            groupSize: row.ranked.groupSize,
            prizeKobo: row.prizeKobo,
            finalizeVersion: version,
          })),
        );
      }
      for (const row of board.rows) {
        if (row.prizeKobo <= 0) continue;
        await this.obligations.create(tx, {
          kind: 'prize',
          userId: row.userId,
          entryId: row.entryId,
          matchDayId: dayId,
          rank: row.ranked.rank,
          amountKobo: row.prizeKobo,
          reason: `${ordinal(row.ranked.rank)} place on ${day.date}`,
        });
      }
      await this.ledger.post(tx, actor, {
        eventKey: `day_finalized:${dayId}:${version}`,
        legs: [
          { account: 'prizes_awarded', amountKobo: awardedKobo },
          { account: 'jackpot_cut', amountKobo: pool.jackpotCutKobo },
          { account: 'operations', amountKobo: pool.operationsKobo + allocation.roundingToOpsKobo },
        ],
        dayId,
        refType: 'match_day',
        refId: dayId,
      });
      await tx
        .update(matchDays)
        .set({
          status: 'finalized',
          finalConfirmedCount: board.confirmedCount,
          finalRevenueKobo: pool.revenueKobo,
          finalParticipantShareKobo: pool.participantShareKobo,
          finalJackpotCutKobo: pool.jackpotCutKobo,
          finalContributionsKobo: pool.contributionsKobo,
          finalDailyPoolKobo: pool.dailyPoolKobo,
          finalOperationsKobo: pool.operationsKobo,
          finalRoundingKobo: allocation.roundingToOpsKobo,
          finalizedAt: new Date(),
          finalizedByAdminId: this.adminId(actor),
          finalizeVersion: version,
        })
        .where(eq(matchDays.id, dayId));
      await this.audit.record(tx, actor, {
        action: 'day.finalized',
        targetType: 'match_day',
        targetId: dayId,
        metadata: {
          version,
          dailyPoolKobo: pool.dailyPoolKobo,
          awardedKobo,
          winners: allocation.awards.filter((a) => a.amountKobo > 0).length,
        },
      });

      const winners = board.rows.filter((row) => row.prizeKobo > 0);
      const winnerUsers = winners.length
        ? await tx
            .select()
            .from(users)
            .where(
              inArray(
                users.id,
                winners.map((w) => w.userId),
              ),
            )
        : [];
      for (const row of winners) {
        const user = winnerUsers.find((p) => p.id === row.userId);
        if (!user) continue;
        await this.email.queue(
          tx,
          user.email,
          prizeWonEmail({
            rank: row.ranked.rank,
            date: day.date,
            prizeKobo: row.prizeKobo,
            link: this.email.link('/me'),
          }),
          'winner',
          user.id,
        );
      }
      await this.obligations.maybeCompleteDay(tx, dayId);
    });
    this.cache.invalidate('public:');
    return this.adminLeaderboard(dayId);
  }

  /** Undoes a finalization, only while no payout for the day has been started. */
  async reopen(actor: Actor, dayId: string, reason: string): Promise<AdminLeaderboard> {
    await this.db.transaction(async (tx) => {
      const day = await this.requireDay(tx, dayId, true);
      if (day.status !== 'finalized') throw new DomainError('BAD_STATUS');
      const [started] = await tx
        .select({ n: count() })
        .from(payoutAttempts)
        .innerJoin(payoutObligations, eq(payoutObligations.id, payoutAttempts.obligationId))
        .where(
          and(eq(payoutObligations.matchDayId, dayId), isNull(payoutObligations.supersededAt)),
        );
      if ((started?.n ?? 0) > 0) throw new DomainError('PAYOUTS_STARTED');

      const now = new Date();
      await tx
        .update(leaderboardRows)
        .set({ supersededAt: now })
        .where(and(eq(leaderboardRows.matchDayId, dayId), isNull(leaderboardRows.supersededAt)));
      await tx
        .update(payoutObligations)
        .set({ supersededAt: now })
        .where(
          and(
            eq(payoutObligations.matchDayId, dayId),
            eq(payoutObligations.kind, 'prize'),
            isNull(payoutObligations.supersededAt),
          ),
        );
      // Reverse exactly what the finalization booked.
      const legs = await tx
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.eventKey, `day_finalized:${dayId}:${day.finalizeVersion}`));
      await this.ledger.post(tx, actor, {
        eventKey: `day_reopened:${dayId}:${day.finalizeVersion}`,
        legs: legs.map((leg) => ({
          account: leg.account as LedgerAccount,
          amountKobo: -leg.amountKobo,
        })),
        dayId,
        refType: 'match_day',
        refId: dayId,
        memo: reason,
      });
      await tx
        .update(matchDays)
        .set({
          status: 'closed',
          finalConfirmedCount: null,
          finalRevenueKobo: null,
          finalParticipantShareKobo: null,
          finalJackpotCutKobo: null,
          finalContributionsKobo: null,
          finalDailyPoolKobo: null,
          finalOperationsKobo: null,
          finalRoundingKobo: null,
          finalizedAt: null,
          finalizedByAdminId: null,
          scoringRev: sql`${matchDays.scoringRev} + 1`,
        })
        .where(eq(matchDays.id, dayId));
      await this.audit.record(tx, actor, {
        action: 'day.reopened',
        targetType: 'match_day',
        targetId: dayId,
        reason,
      });
    });
    this.cache.invalidate('public:');
    return this.adminLeaderboard(dayId);
  }

  /** Cancels the day: everyone who paid gets the full fee back; sponsor money is returned. */
  async cancel(actor: Actor, dayId: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const day = await this.requireDay(tx, dayId, true);
      if (['finalized', 'completed', 'cancelled'].includes(day.status))
        throw new DomainError('BAD_STATUS');
      const now = new Date();
      const paid = await tx
        .select({ entry: entries, email: users.email })
        .from(entries)
        .innerJoin(users, eq(users.id, entries.userId))
        .where(and(eq(entries.matchDayId, dayId), eq(entries.status, 'confirmed')));
      for (const { entry, email } of paid) {
        await tx
          .update(entries)
          .set({ status: 'refunded', refundedAt: now })
          .where(eq(entries.id, entry.id));
        const obligation = await this.obligations.create(tx, {
          kind: 'refund',
          userId: entry.userId,
          entryId: entry.id,
          matchDayId: dayId,
          bankPaymentId: null,
          amountKobo: entry.feeKobo,
          reason: `The ${day.date} contest was cancelled: ${reason}`,
        });
        await this.ledger.post(tx, actor, {
          eventKey: `refund_owed:${obligation!.id}`,
          legs: [{ account: 'refunds_owed', amountKobo: entry.feeKobo }],
          dayId,
          refType: 'payout_obligation',
          refId: obligation!.id,
        });
        await this.email.queue(
          tx,
          email,
          dayCancelledEmail({
            date: day.date,
            feeKobo: entry.feeKobo,
            link: this.email.link('/me'),
          }),
          'notice',
          entry.userId,
        );
      }
      await tx
        .update(entries)
        .set({ status: 'expired' })
        .where(
          and(
            eq(entries.matchDayId, dayId),
            inArray(entries.status, ['awaiting_payment', 'payment_review']),
          ),
        );
      const contributions = await tx
        .select()
        .from(prizeContributions)
        .where(
          and(eq(prizeContributions.matchDayId, dayId), eq(prizeContributions.status, 'allocated')),
        );
      for (const contribution of contributions) {
        await tx
          .update(prizeContributions)
          .set({ status: 'returned', returnedAt: now })
          .where(eq(prizeContributions.id, contribution.id));
        await this.ledger.post(tx, actor, {
          eventKey: `contribution_returned:${contribution.id}`,
          legs: [{ account: 'contributions', amountKobo: -contribution.amountKobo }],
          dayId,
          refType: 'prize_contribution',
          refId: contribution.id,
          memo: 'Day cancelled',
        });
      }
      await tx
        .update(matchDays)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: reason,
          cancelledByAdminId: this.adminId(actor),
        })
        .where(eq(matchDays.id, dayId));
      await this.audit.record(tx, actor, {
        action: 'day.cancelled',
        targetType: 'match_day',
        targetId: dayId,
        reason,
        metadata: { refunds: paid.length },
      });
    });
    this.cache.invalidate('public:');
    return this.days.get(dayId);
  }

  // -------------------------------------------------------------------------------------------

  private async finalizeCheck(executor: Executor, day: DayRow, board: ComputedLeaderboard) {
    const blockers: string[] = [];
    const warnings: string[] = [];
    if (day.status === 'open') blockers.push('Close the day first.');
    else if (day.status !== 'closed') blockers.push('Only a closed day can be finalized.');

    const dayMatches = await executor.select().from(matches).where(eq(matches.matchDayId, day.id));
    const pending = dayMatches.filter((m) => m.status === 'scheduled');
    if (pending.length > 0) {
      blockers.push(
        `${pending.length} match${pending.length === 1 ? ' has' : 'es have'} no confirmed result (confirm it or void the match).`,
      );
    }
    if (dayMatches.length > 0) {
      const [unconfirmed] = await executor
        .select({ n: count() })
        .from(matchResults)
        .where(
          and(
            inArray(
              matchResults.matchId,
              dayMatches.map((m) => m.id),
            ),
            eq(matchResults.status, 'provisional'),
          ),
        );
      if ((unconfirmed?.n ?? 0) > 0) blockers.push('Some entered results are not confirmed yet.');
    }

    const played = dayMatches.filter((m) => m.status === 'final').length;
    const needed = day.minScoredMatches ?? 1;
    if (played < needed) {
      blockers.push(
        `Only ${played} of the needed ${needed} matches were played: cancel the day (full refunds) instead.`,
      );
    }
    const [review] = await executor
      .select({ n: count() })
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.status, 'payment_review')));
    if ((review?.n ?? 0) > 0) blockers.push(`${review!.n} payment claim(s) still need a decision.`);
    if (board.confirmedCount > 0 && board.rows.length === 0 && pending.length === 0) {
      blockers.push('Nobody qualifies for a prize: cancel the day and refund everyone instead.');
    }

    const [unpaid] = await executor
      .select({ n: count() })
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.status, 'awaiting_payment')));
    if ((unpaid?.n ?? 0) > 0) {
      warnings.push(
        `${unpaid!.n} player(s) joined but never paid; their entries will be marked not confirmed.`,
      );
    }
    if (board.unranked.length > 0) {
      warnings.push(
        `${board.unranked.length} paid player(s) aren't ranked (disqualified or no picks that count).`,
      );
    }
    return { canFinalize: blockers.length === 0, blockers, warnings };
  }

  private async lockMatch(tx: Executor, matchId: string) {
    const [peek] = await tx.select().from(matches).where(eq(matches.id, matchId));
    if (!peek) throw new DomainError('NOT_FOUND');
    const day = await this.requireDay(tx, peek.matchDayId, true);
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for('update');
    return { day, match: match! };
  }

  private async requireDay(executor: Executor, dayId: string, forUpdate = false): Promise<DayRow> {
    const query = executor.select().from(matchDays).where(eq(matchDays.id, dayId));
    const [day] = forUpdate ? await query.for('update') : await query;
    if (!day) throw new DomainError('NOT_FOUND');
    return day;
  }

  private async bumpScoring(tx: Executor, dayId: string) {
    await tx
      .update(matchDays)
      .set({ scoringRev: sql`${matchDays.scoringRev} + 1` })
      .where(eq(matchDays.id, dayId));
  }

  private adminId(actor: Actor): string {
    if (actor.type !== 'admin') throw new Error('This action needs an admin');
    return actor.id;
  }
}
