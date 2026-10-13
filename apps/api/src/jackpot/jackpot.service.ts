import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import type {
  JackpotAdminView,
  JackpotOrders,
  JackpotView,
  MyJackpotView,
  TeamRef,
} from '@predict/contracts';
import {
  and,
  eq,
  entries,
  inArray,
  isNull,
  isNotNull,
  jackpotEntries,
  jackpots,
  leagues,
  leagueTeams,
  matchDays,
  prizeContributions,
  sql,
  sum,
  users,
  type Database,
  type Executor,
} from '@predict/db';
import {
  formatNaira,
  rankJackpot,
  type Category,
  type JackpotCandidate,
  type StandingsOrders,
} from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { enforceLimits, MINUTE } from '../common/limits';
import { RateLimitService } from '../common/rate-limit.service';
import { ContestReadService } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { ObligationsService } from '../payouts/obligations.service';
import { PublicService } from '../public/public.service';
import { StandingsService } from '../setup/standings.service';
import { SmsService } from '../sms/sms.service';

type JackpotRow = typeof jackpots.$inferSelect;
type LeagueRow = typeof leagues.$inferSelect;

const CATEGORIES: Category[] = ['men', 'women'];
const sameOrders = (a: StandingsOrders, b: StandingsOrders) =>
  CATEGORIES.every((c) => JSON.stringify(a[c] ?? []) === JSON.stringify(b[c] ?? []));

/** The league jackpot: predicting both final tables, the ranking, and settlement. */
@Injectable()
export class JackpotService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly read: ContestReadService,
    private readonly publicService: PublicService,
    private readonly standings: StandingsService,
    private readonly obligations: ObligationsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly cache: TtlCache,
    private readonly limits: RateLimitService,
  ) {}

  async view(userId: string | null): Promise<JackpotView> {
    const { league, jackpot } = await this.current();
    const [publicJackpot, tables, ranking, winner] = await Promise.all([
      this.publicService.jackpot(league.id, league.name),
      this.tables(league.id),
      this.isOpen(jackpot, league) ? Promise.resolve([]) : this.ranking(league, jackpot),
      this.winner(jackpot),
    ]);
    const names = await this.displayNames(ranking.slice(0, 50).map((row) => row.userId));
    return {
      serverNow: new Date(),
      jackpot: publicJackpot!,
      tables,
      ranking: ranking.slice(0, 50).map((row) => ({
        position: row.position,
        displayName: names.get(row.userId) ?? 'Player',
        distance: row.distance,
        mine: row.userId === userId,
      })),
      rankingFinal: league.standingsFinalizedAt !== null,
      winner,
    };
  }

  async mine(userId: string): Promise<MyJackpotView> {
    const { league, jackpot } = await this.current();
    const [entry] = await this.db
      .select()
      .from(jackpotEntries)
      .where(and(eq(jackpotEntries.jackpotId, jackpot.id), eq(jackpotEntries.userId, userId)));
    const eligible = (await this.eligibleUsers(league.id, [userId])).has(userId);
    let position: number | null = null;
    let distance: number | null = null;
    if (entry && !this.isOpen(jackpot, league)) {
      const mine = (await this.ranking(league, jackpot)).find((row) => row.userId === userId);
      position = mine?.position ?? null;
      distance = mine?.distance ?? null;
    }
    return {
      orders: entry ? { men: entry.orders.men ?? [], women: entry.orders.women ?? [] } : null,
      submittedAt: entry?.submittedAt ?? null,
      eligible,
      canSubmit: !entry && this.isOpen(jackpot, league),
      position,
      distance,
    };
  }

  /**
   * Submits the predicted tables, once. A submitted prediction can't be changed by anyone (a
   * database trigger enforces it). Sending the identical order again (a retry) is harmless.
   */
  async submit(userId: string, orders: JackpotOrders): Promise<MyJackpotView> {
    await enforceLimits(this.limits, [{ key: `jackpot:${userId}`, limit: 30, windowSec: MINUTE }]);
    const { league, jackpot } = await this.current();
    if (!this.isOpen(jackpot, league)) throw new DomainError('JACKPOT_CLOSED');
    const teams = await this.db
      .select()
      .from(leagueTeams)
      .where(and(eq(leagueTeams.leagueId, league.id), isNull(leagueTeams.withdrawnAt)));
    for (const category of CATEGORIES) {
      const expected = teams
        .filter((t) => t.category === category)
        .map((t) => t.teamId)
        .sort();
      const given = [...(orders[category] ?? [])];
      if (JSON.stringify([...given].sort()) !== JSON.stringify(expected)) {
        throw new DomainError('BAD_ORDER');
      }
    }
    const normalized: StandingsOrders = { men: orders.men ?? [], women: orders.women ?? [] };
    const rules = await this.publicService.rules();

    await this.db.transaction(async (tx) => {
      const clock = await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
      const now = new Date(clock.rows[0]!.now);
      if (now >= jackpot.entryClosesAt) throw new DomainError('JACKPOT_CLOSED');
      const [created] = await tx
        .insert(jackpotEntries)
        .values({
          jackpotId: jackpot.id,
          userId,
          orders: normalized,
          submittedAt: now,
          rulesHash: rules.hash,
        })
        .onConflictDoNothing({ target: [jackpotEntries.jackpotId, jackpotEntries.userId] })
        .returning({ id: jackpotEntries.id });
      if (created) return;
      const [existing] = await tx
        .select({ orders: jackpotEntries.orders })
        .from(jackpotEntries)
        .where(and(eq(jackpotEntries.jackpotId, jackpot.id), eq(jackpotEntries.userId, userId)));
      if (!existing || !sameOrders(existing.orders, normalized)) {
        throw new DomainError('ALREADY_SUBMITTED');
      }
    });
    this.cache.invalidate('public:');
    return this.mine(userId);
  }

  // -------------------------------------------------------------------------------------------
  // Staff

  async adminView(leagueId: string): Promise<JackpotAdminView> {
    const [league] = await this.db.select().from(leagues).where(eq(leagues.id, leagueId));
    const [jackpot] = await this.db.select().from(jackpots).where(eq(jackpots.leagueId, leagueId));
    if (!league || !jackpot) throw new DomainError('NOT_FOUND');
    const amounts = await this.amounts(this.db, jackpot);
    const all = await this.db
      .select()
      .from(jackpotEntries)
      .where(eq(jackpotEntries.jackpotId, jackpot.id));
    const eligible = await this.eligibleUsers(
      leagueId,
      all.map((e) => e.userId),
    );
    const ranking = await this.ranking(league, jackpot);
    const names = await this.displayNames(ranking.slice(0, 10).map((row) => row.userId));
    return {
      leagueId,
      jackpotId: jackpot.id,
      status: jackpot.status,
      entryClosesAt: jackpot.entryClosesAt,
      amounts: {
        fromDaysKobo: amounts.fromDaysKobo,
        contributionsKobo: amounts.contributionsKobo,
        totalKobo: amounts.fromDaysKobo + amounts.contributionsKobo,
        finalKobo: jackpot.finalAmountKobo,
      },
      entries: all.length,
      eligibleEntries: all.filter((e) => eligible.has(e.userId)).length,
      preview: ranking.slice(0, 10).map((row) => ({
        position: row.position,
        displayName: names.get(row.userId) ?? 'Player',
        distance: row.distance,
        submittedAt: row.submittedAt,
      })),
      blockers: await this.settleBlockers(this.db, league, jackpot),
      winner: await this.winner(jackpot),
    };
  }

  /**
   * Picks the winner against the final standings and records what we owe them. With nobody
   * eligible the jackpot is marked to carry over to the next league.
   */
  async settle(actor: Actor, leagueId: string): Promise<JackpotAdminView> {
    await this.db.transaction(async (tx) => {
      const [league] = await tx.select().from(leagues).where(eq(leagues.id, leagueId));
      const [jackpot] = await tx
        .select()
        .from(jackpots)
        .where(eq(jackpots.leagueId, leagueId))
        .for('update');
      if (!league || !jackpot) throw new DomainError('NOT_FOUND');
      if (jackpot.status === 'settled' || jackpot.status === 'carried_over') return;
      const blockers = await this.settleBlockers(tx, league, jackpot);
      if (blockers.length > 0) throw new DomainError('NOT_READY', { blockers });

      const amounts = await this.amounts(tx, jackpot);
      const total = amounts.fromDaysKobo + amounts.contributionsKobo;
      const ranking = await this.ranking(league, jackpot, tx);
      const winner = ranking[0];

      if (!winner) {
        await tx
          .update(jackpots)
          .set({
            status: 'carried_over',
            finalAmountKobo: total,
            settledAt: new Date(),
            settledByAdminId: actor.type === 'admin' ? actor.id : null,
          })
          .where(eq(jackpots.id, jackpot.id));
        await this.audit.record(tx, actor, {
          action: 'jackpot.carried_over',
          targetType: 'jackpot',
          targetId: jackpot.id,
          metadata: { amountKobo: total },
        });
        return;
      }

      await tx
        .update(jackpots)
        .set({
          status: 'settled',
          finalAmountKobo: total,
          winnerJackpotEntryId: winner.entryId,
          winnerDistance: winner.distance,
          settledAt: new Date(),
          settledByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(eq(jackpots.id, jackpot.id));
      if (total > 0) {
        await this.obligations.create(tx, {
          kind: 'jackpot',
          userId: winner.userId,
          jackpotId: jackpot.id,
          amountKobo: total,
          rank: 1,
          reason: `${league.name} jackpot`,
        });
        await this.ledger.post(tx, actor, {
          eventKey: `jackpot_awarded:${jackpot.id}`,
          legs: [{ account: 'jackpot_awarded', amountKobo: total }],
          jackpotId: jackpot.id,
          refType: 'jackpot',
          refId: jackpot.id,
        });
      }
      await this.audit.record(tx, actor, {
        action: 'jackpot.settled',
        targetType: 'jackpot',
        targetId: jackpot.id,
        metadata: { winnerEntryId: winner.entryId, distance: winner.distance, amountKobo: total },
      });
      const [user] = await tx.select().from(users).where(eq(users.id, winner.userId));
      if (user && total > 0) {
        await this.sms.queue(
          tx,
          user.phone,
          `${product.name}: you won the ${league.name} jackpot (${formatNaira(total)})! Add your bank details in the app to get paid.`,
          'winner',
          user.id,
        );
      }
    });
    this.cache.invalidate('public:');
    return this.adminView(leagueId);
  }

  // -------------------------------------------------------------------------------------------

  private async current(): Promise<{ league: LeagueRow; jackpot: JackpotRow }> {
    const league = await this.publicService.currentLeague();
    if (!league) throw new DomainError('NO_JACKPOT');
    const [jackpot] = await this.db.select().from(jackpots).where(eq(jackpots.leagueId, league.id));
    if (!jackpot) throw new DomainError('NO_JACKPOT');
    return { league, jackpot };
  }

  private isOpen(jackpot: JackpotRow, league: LeagueRow) {
    return (
      league.status === 'active' && jackpot.status === 'open' && jackpot.entryClosesAt > new Date()
    );
  }

  /** Teams to order, per category, in the current table order. */
  private async tables(leagueId: string): Promise<Array<{ category: Category; teams: TeamRef[] }>> {
    const orders = await this.standings.orders(leagueId);
    const refs = await this.read.teamRefs([...orders.men, ...orders.women]);
    return CATEGORIES.filter((category) => orders[category].length > 0).map((category) => ({
      category,
      teams: orders[category].map((id) => refs.get(id)!),
    }));
  }

  /** Every jackpot entry ranked against the current (or final) standings; eligible players only. */
  private async ranking(league: LeagueRow, jackpot: JackpotRow, executor: Executor = this.db) {
    const rows = await executor
      .select()
      .from(jackpotEntries)
      .where(eq(jackpotEntries.jackpotId, jackpot.id));
    if (rows.length === 0) return [];
    const eligible = await this.eligibleUsers(
      league.id,
      rows.map((row) => row.userId),
      executor,
    );
    const final = await this.standings.orders(league.id, executor);
    const names = await this.standings.teamNames(league.id, executor);
    const candidates: JackpotCandidate[] = rows.map((row) => ({
      entryId: row.id,
      orders: row.orders,
      submittedAt: row.submittedAt,
      eligible: eligible.has(row.userId),
    }));
    const byEntry = new Map(rows.map((row) => [row.id, row]));
    return rankJackpot(candidates, final, names).map((standing) => ({
      ...standing,
      userId: byEntry.get(standing.entryId)!.userId,
      submittedAt: byEntry.get(standing.entryId)!.submittedAt,
    }));
  }

  /** Players with at least one confirmed, non-disqualified daily entry in the league. */
  private async eligibleUsers(leagueId: string, userIds: string[], executor: Executor = this.db) {
    if (userIds.length === 0) return new Set<string>();
    const rows = await executor
      .selectDistinct({ userId: entries.userId })
      .from(entries)
      .innerJoin(matchDays, eq(matchDays.id, entries.matchDayId))
      .innerJoin(users, eq(users.id, entries.userId))
      .where(
        and(
          eq(matchDays.leagueId, leagueId),
          eq(entries.status, 'confirmed'),
          isNull(entries.disqualifiedAt),
          eq(users.status, 'active'),
          inArray(entries.userId, [...new Set(userIds)]),
        ),
      );
    return new Set(rows.map((row) => row.userId));
  }

  private async amounts(executor: Executor, jackpot: JackpotRow) {
    const [[cuts], [extra]] = await Promise.all([
      executor
        .select({ total: sum(matchDays.finalJackpotCutKobo) })
        .from(matchDays)
        .where(and(eq(matchDays.leagueId, jackpot.leagueId), isNotNull(matchDays.finalizedAt))),
      executor
        .select({ total: sum(prizeContributions.amountKobo) })
        .from(prizeContributions)
        .where(
          and(
            eq(prizeContributions.jackpotId, jackpot.id),
            eq(prizeContributions.status, 'allocated'),
          ),
        ),
    ]);
    return { fromDaysKobo: Number(cuts?.total ?? 0), contributionsKobo: Number(extra?.total ?? 0) };
  }

  private async settleBlockers(executor: Executor, league: LeagueRow, jackpot: JackpotRow) {
    const blockers: string[] = [];
    if (jackpot.status === 'settled' || jackpot.status === 'carried_over') return blockers;
    if (jackpot.entryClosesAt > new Date()) blockers.push('Jackpot predictions are still open.');
    if (!league.standingsFinalizedAt) blockers.push('Finalize the league standings first.');
    const unfinished = await executor
      .select({ date: matchDays.date, status: matchDays.status })
      .from(matchDays)
      .where(
        and(
          eq(matchDays.leagueId, league.id),
          sql`${matchDays.status} not in ('finalized', 'completed', 'cancelled')`,
        ),
      );
    for (const day of unfinished) {
      blockers.push(
        `The ${day.date} match-day is still ${day.status}: finalize or cancel it first.`,
      );
    }
    return blockers;
  }

  private async winner(jackpot: JackpotRow) {
    if (jackpot.status !== 'settled' || !jackpot.winnerJackpotEntryId) return null;
    const [row] = await this.db
      .select({ displayName: users.displayName })
      .from(jackpotEntries)
      .innerJoin(users, eq(users.id, jackpotEntries.userId))
      .where(eq(jackpotEntries.id, jackpot.winnerJackpotEntryId));
    return {
      displayName: row?.displayName ?? 'Player',
      distance: jackpot.winnerDistance ?? 0,
      amountKobo: jackpot.finalAmountKobo ?? 0,
    };
  }

  private async displayNames(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, string>();
    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, [...new Set(userIds)]));
    return new Map(rows.map((row) => [row.id, row.displayName]));
  }
}
