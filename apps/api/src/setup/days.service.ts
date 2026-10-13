import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import type {
  AddMatchInput,
  AdminDayView,
  DayStatus,
  UpdateDayInput,
  UpdateMatchInput,
} from '@predict/contracts';
import {
  and,
  asc,
  count,
  eq,
  entries,
  inArray,
  jackpots,
  leagues,
  leagueTeams,
  matchDays,
  matches,
  sql,
  type Database,
  type Executor,
} from '@predict/db';
import {
  buildRules,
  entryCutoff,
  fnv1a64,
  lockAt,
  rulesHash,
  validatePrizeTiers,
  watToUtc,
} from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import {
  ContestReadService,
  dayConfig,
  dayTiming,
  matchTiming,
  type DayRow,
  type MatchRow,
} from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { SettingsService } from './settings.service';

const BEFORE_OPEN: DayStatus[] = ['draft', 'published'];
const RUNNING: DayStatus[] = ['published', 'open', 'closed'];

@Injectable()
export class DaysService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly read: ContestReadService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly cache: TtlCache,
  ) {}

  async list(leagueId?: string, status?: DayStatus) {
    const rows = await this.db
      .select({ day: matchDays, leagueName: leagues.name })
      .from(matchDays)
      .innerJoin(leagues, eq(leagues.id, matchDays.leagueId))
      .where(
        and(
          leagueId ? eq(matchDays.leagueId, leagueId) : undefined,
          status ? eq(matchDays.status, status) : undefined,
        ),
      )
      .orderBy(asc(matchDays.date));
    const cards = await this.read.dayCards(rows.map((row) => row.day));
    return cards.map((card, index) => ({ ...card, leagueName: rows[index]!.leagueName }));
  }

  async get(id: string): Promise<AdminDayView> {
    const [row] = await this.db
      .select({ day: matchDays, leagueName: leagues.name })
      .from(matchDays)
      .innerJoin(leagues, eq(leagues.id, matchDays.leagueId))
      .where(eq(matchDays.id, id));
    if (!row) throw new DomainError('NOT_FOUND');
    const { day } = row;
    const [views, pools, counts, matchRows, blockers] = await Promise.all([
      this.read.matchViews([day]),
      this.read.pools([day]),
      this.entryCounts(id),
      this.db.select().from(matches).where(eq(matches.matchDayId, id)),
      BEFORE_OPEN.includes(day.status) ? this.openBlockers(this.db, day) : Promise.resolve([]),
    ]);
    return {
      id: day.id,
      leagueId: day.leagueId,
      leagueName: row.leagueName,
      date: day.date,
      title: day.title,
      status: day.status,
      config: dayConfig(day),
      opensAt: day.opensAt,
      submissionsCloseAt: day.submissionsCloseAt,
      openedAt: day.openedAt,
      closedAt: day.closedAt,
      finalizedAt: day.finalizedAt,
      cancelledAt: day.cancelledAt,
      cancelReason: day.cancelReason,
      entryCutoff: entryCutoff(dayTiming(day), matchRows.map(matchTiming)),
      matches: views.get(day.id) ?? [],
      counts,
      pool: pools.get(day.id)!,
      openBlockers: blockers,
    };
  }

  async update(actor: Actor, input: UpdateDayInput): Promise<AdminDayView> {
    await this.mutateDay(actor, input.id, 'day.updated', async (tx, day) => {
      if (input.config && day.openedAt) throw new DomainError('DAY_LOCKED');
      if (input.submissionsCloseAt !== undefined) {
        if (!['draft', 'published', 'open'].includes(day.status))
          throw new DomainError('BAD_STATUS');
        if (
          day.status === 'open' &&
          input.submissionsCloseAt &&
          input.submissionsCloseAt <= new Date()
        ) {
          throw new DomainError('CLOSE_IN_PAST');
        }
      }
      if (input.opensAt !== undefined && !BEFORE_OPEN.includes(day.status)) {
        throw new DomainError('BAD_STATUS');
      }
      const config = input.config;
      await tx
        .update(matchDays)
        .set({
          title: input.title,
          opensAt: input.opensAt,
          submissionsCloseAt: input.submissionsCloseAt,
          ...(config
            ? {
                entryFeeKobo: config.entryFeeKobo,
                prizeBps: config.prizeBps,
                jackpotBps: config.jackpotBps,
                prizeTiersBps: config.prizeTiersBps,
                scoring: config.scoring,
                format: config.format,
                tieBreakers: config.tieBreakers,
                lockLeadMin: config.lockLeadMin,
                minScoredMatches: config.minScoredMatches,
              }
            : {}),
        })
        .where(eq(matchDays.id, day.id));
    });
    return this.get(input.id);
  }

  async addMatch(actor: Actor, input: AddMatchInput): Promise<AdminDayView> {
    await this.mutateDay(actor, input.id, 'match.added', async (tx, day) => {
      if (!BEFORE_OPEN.includes(day.status)) throw new DomainError('DAY_LOCKED');
      const category = await this.checkTeams(tx, day.leagueId, input.homeTeamId, input.awayTeamId);
      const [existing] = await tx
        .select({ n: count() })
        .from(matches)
        .where(eq(matches.matchDayId, day.id));
      await tx.insert(matches).values({
        matchDayId: day.id,
        homeTeamId: input.homeTeamId,
        awayTeamId: input.awayTeamId,
        category,
        scheduledAt: watToUtc(day.date, input.time),
        venue: input.venue ?? null,
        displayOrder: existing?.n ?? 0,
      });
    });
    return this.get(input.id);
  }

  async updateMatch(actor: Actor, input: UpdateMatchInput): Promise<AdminDayView> {
    const match = await this.requireMatch(this.db, input.id);
    await this.mutateDay(actor, match.matchDayId, 'match.updated', async (tx, day) => {
      if (input.time !== undefined && day.openedAt) throw new DomainError('DAY_LOCKED');
      await tx
        .update(matches)
        .set({
          scheduledAt: input.time ? watToUtc(day.date, input.time) : undefined,
          venue: input.venue,
          displayOrder: input.displayOrder,
        })
        .where(eq(matches.id, match.id));
    });
    return this.get(match.matchDayId);
  }

  async removeMatch(actor: Actor, matchId: string): Promise<AdminDayView> {
    const match = await this.requireMatch(this.db, matchId);
    await this.mutateDay(actor, match.matchDayId, 'match.removed', async (tx, day) => {
      if (day.openedAt) throw new DomainError('DAY_LOCKED');
      await tx.delete(matches).where(eq(matches.id, match.id));
    });
    return this.get(match.matchDayId);
  }

  async publish(actor: Actor, id: string): Promise<AdminDayView> {
    await this.mutateDay(actor, id, 'day.published', async (tx, day) => {
      if (day.status === 'published') return;
      if (day.status !== 'draft') throw new DomainError('BAD_STATUS');
      const [total] = await tx
        .select({ n: count() })
        .from(matches)
        .where(eq(matches.matchDayId, id));
      if ((total?.n ?? 0) === 0) {
        throw new DomainError('NOT_READY', { blockers: ['Add at least one match.'] });
      }
      await tx.update(matchDays).set({ status: 'published' }).where(eq(matchDays.id, id));
    });
    return this.get(id);
  }

  /**
   * Opens entries. From here the day's money and ranking settings are frozen (a database trigger
   * enforces it), and the rules players agree to are stored with their hash.
   */
  async open(actor: Actor, id: string): Promise<AdminDayView> {
    await this.mutateDay(actor, id, 'day.opened', (tx, day) => this.openLocked(tx, day, actor));
    return this.get(id);
  }

  /** Opens an already-locked day row. Shared with the scheduler's automatic opening. */
  async openLocked(tx: Executor, day: DayRow, actor: Actor) {
    if (day.status === 'open') return;
    if (!BEFORE_OPEN.includes(day.status)) throw new DomainError('BAD_STATUS');
    const blockers = await this.openBlockers(tx, day);
    if (blockers.length > 0) throw new DomainError('NOT_READY', { blockers });

    const settings = await this.settings.row(tx);
    const [jackpot] = await tx.select().from(jackpots).where(eq(jackpots.leagueId, day.leagueId));
    const [playable] = await tx
      .select({ n: count() })
      .from(matches)
      .where(and(eq(matches.matchDayId, day.id), sql`${matches.status} <> 'void'`));
    const minScoredMatches = day.minScoredMatches ?? Math.ceil((playable?.n ?? 1) / 2);
    const config = { ...dayConfig(day), minScoredMatches };
    const rules = buildRules({
      productName: product.name,
      entryFeeKobo: config.entryFeeKobo,
      prizeBps: config.prizeBps,
      jackpotBps: config.jackpotBps,
      prizeTiersBps: config.prizeTiersBps,
      scoring: config.scoring,
      format: config.format,
      tieBreakers: config.tieBreakers,
      lockLeadMin: config.lockLeadMin,
      minScoredMatches,
      jackpotEntryClosesAt: jackpot?.entryClosesAt ?? null,
      claimHelp: settings.supportContact ?? undefined,
    });
    await tx
      .update(matchDays)
      .set({
        status: 'open',
        openedAt: new Date(),
        openedByAdminId: actor.type === 'admin' ? actor.id : null,
        minScoredMatches,
        rulesSnapshot: rules,
        rulesHash: rulesHash(rules),
        configHash: fnv1a64(JSON.stringify(config)),
        collectionAccount: settings.collectionAccount,
      })
      .where(eq(matchDays.id, day.id));
  }

  /** Closes submissions now. Matches whose lock already passed are unaffected. */
  async close(actor: Actor, id: string): Promise<AdminDayView> {
    await this.mutateDay(actor, id, 'day.closed', async (tx, day) => {
      if (day.status === 'closed') return;
      if (day.status !== 'open') throw new DomainError('BAD_STATUS');
      await tx
        .update(matchDays)
        .set({
          status: 'closed',
          closedAt: sql`clock_timestamp()`,
          closedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(eq(matchDays.id, id));
    });
    return this.get(id);
  }

  async markStarted(actor: Actor, matchId: string, startedAt: Date, reason: string) {
    const match = await this.requireMatch(this.db, matchId);
    await this.mutateDay(
      actor,
      match.matchDayId,
      'match.marked_started',
      async (tx, day) => {
        if (!RUNNING.includes(day.status)) throw new DomainError('BAD_STATUS');
        if (startedAt > new Date()) throw new DomainError('BAD_STATUS');
        const earliest =
          match.actualStartAt && match.actualStartAt < startedAt ? match.actualStartAt : startedAt;
        await tx.update(matches).set({ actualStartAt: earliest }).where(eq(matches.id, match.id));
        await this.bumpScoring(tx, day.id);
      },
      reason,
      { matchId, startedAt },
    );
    return this.get(match.matchDayId);
  }

  async voidMatch(actor: Actor, matchId: string, reason: string) {
    const match = await this.requireMatch(this.db, matchId);
    await this.mutateDay(
      actor,
      match.matchDayId,
      'match.voided',
      async (tx, day) => {
        if (!RUNNING.includes(day.status)) throw new DomainError('BAD_STATUS');
        if (match.status === 'void') return;
        await tx
          .update(matches)
          .set({ status: 'void', voidReason: reason })
          .where(eq(matches.id, match.id));
        await this.bumpScoring(tx, day.id);
      },
      reason,
      { matchId },
    );
    return this.get(match.matchDayId);
  }

  /** Moves a match's start time within its day. A lock that already passed never reopens. */
  async reschedule(actor: Actor, matchId: string, time: string, reason: string) {
    const match = await this.requireMatch(this.db, matchId);
    await this.mutateDay(
      actor,
      match.matchDayId,
      'match.rescheduled',
      async (tx, day) => {
        if (
          day.status === 'finalized' ||
          day.status === 'completed' ||
          day.status === 'cancelled'
        ) {
          throw new DomainError('BAD_STATUS');
        }
        const now = new Date();
        const currentLock = lockAt(matchTiming(match), dayTiming(day));
        const lockedAt =
          day.openedAt && now >= currentLock ? (match.lockedAt ?? currentLock) : match.lockedAt;
        await tx
          .update(matches)
          .set({ scheduledAt: watToUtc(day.date, time), lockedAt })
          .where(eq(matches.id, match.id));
      },
      reason,
      { matchId, from: match.scheduledAt, to: time },
    );
    return this.get(match.matchDayId);
  }

  /** What stops a day from opening, in plain words. */
  async openBlockers(executor: Executor, day: DayRow): Promise<string[]> {
    const blockers: string[] = [];
    const [league] = await executor.select().from(leagues).where(eq(leagues.id, day.leagueId));
    if (league?.status !== 'active')
      blockers.push('Start the league first (Leagues → Start league).');
    const dayMatches = await executor.select().from(matches).where(eq(matches.matchDayId, day.id));
    const playable = dayMatches.filter((match) => match.status !== 'void');
    if (playable.length === 0) blockers.push('Add at least one match.');
    const now = new Date();
    for (const match of playable) {
      if (match.scheduledAt <= now) {
        blockers.push('A match has already started: void it or move its time.');
        break;
      }
    }
    const settings = await this.settings.row(executor);
    if (!settings.collectionAccount) {
      blockers.push('Add the bank account players pay into (Settings).');
    }
    blockers.push(...validatePrizeTiers(day.prizeTiersBps));
    if (day.minScoredMatches !== null && day.minScoredMatches > playable.length) {
      blockers.push('The minimum number of played matches is higher than the number of matches.');
    }
    return blockers;
  }

  private async entryCounts(dayId: string) {
    const rows = await this.db
      .select({ status: entries.status, n: count() })
      .from(entries)
      .where(eq(entries.matchDayId, dayId))
      .groupBy(entries.status);
    const by = Object.fromEntries(rows.map((row) => [row.status, row.n]));
    return {
      awaitingPayment: by.awaiting_payment ?? 0,
      paymentReview: by.payment_review ?? 0,
      confirmed: by.confirmed ?? 0,
    };
  }

  /** Runs a change on a locked day row and records it in the audit log, in one transaction. */
  private async mutateDay(
    actor: Actor,
    dayId: string,
    action: string,
    change: (tx: Executor, day: DayRow) => Promise<void>,
    reason?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.db.transaction(async (tx) => {
      const [day] = await tx.select().from(matchDays).where(eq(matchDays.id, dayId)).for('update');
      if (!day) throw new DomainError('NOT_FOUND');
      await change(tx, day);
      const [after] = await tx.select().from(matchDays).where(eq(matchDays.id, dayId));
      await this.audit.record(tx, actor, {
        action,
        targetType: 'match_day',
        targetId: dayId,
        reason,
        metadata,
        before: snapshot(day),
        after: snapshot(after!),
      });
    });
    this.cache.invalidate('public:');
  }

  private async bumpScoring(tx: Executor, dayId: string) {
    await tx
      .update(matchDays)
      .set({ scoringRev: sql`${matchDays.scoringRev} + 1` })
      .where(eq(matchDays.id, dayId));
  }

  private async checkTeams(tx: Executor, leagueId: string, homeId: string, awayId: string) {
    if (homeId === awayId) throw new DomainError('TEAM_MISMATCH');
    const rows = await tx
      .select({ teamId: leagueTeams.teamId, category: leagueTeams.category })
      .from(leagueTeams)
      .where(
        and(eq(leagueTeams.leagueId, leagueId), inArray(leagueTeams.teamId, [homeId, awayId])),
      );
    if (rows.length !== 2 || rows[0]!.category !== rows[1]!.category) {
      throw new DomainError('TEAM_MISMATCH');
    }
    return rows[0]!.category;
  }

  private async requireMatch(executor: Executor, id: string): Promise<MatchRow> {
    const [match] = await executor.select().from(matches).where(eq(matches.id, id));
    if (!match) throw new DomainError('NOT_FOUND');
    return match;
  }
}

const snapshot = (day: DayRow) => ({
  status: day.status,
  title: day.title,
  config: dayConfig(day),
  opensAt: day.opensAt,
  submissionsCloseAt: day.submissionsCloseAt,
  closedAt: day.closedAt,
});
