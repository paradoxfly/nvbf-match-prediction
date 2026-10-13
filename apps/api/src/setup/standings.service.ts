import { Inject, Injectable } from '@nestjs/common';
import {
  CATEGORY_LABELS,
  type AdminStandings,
  type Category,
  type LeagueTeamView,
  type StandingsRowInput,
} from '@predict/contracts';
import {
  and,
  eq,
  isNull,
  leagues,
  leagueTeams,
  matchDays,
  matches,
  matchResults,
  type Database,
  type Executor,
} from '@predict/db';
import { defaultStandingsOrder, standingsFromResults } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { ContestReadService } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

/** Staff-maintained league tables. The final tables decide the jackpot. */
@Injectable()
export class StandingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly read: ContestReadService,
    private readonly audit: AuditService,
    private readonly cache: TtlCache,
  ) {}

  async get(leagueId: string): Promise<AdminStandings> {
    const [league] = await this.db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) throw new DomainError('NOT_FOUND');
    const rows = await this.db.select().from(leagueTeams).where(eq(leagueTeams.leagueId, leagueId));
    const refs = await this.read.teamRefs(rows.map((row) => row.teamId));
    const tables = CATEGORIES.map((category) => {
      const inCategory = rows.filter((row) => row.category === category);
      const views: LeagueTeamView[] = inCategory.map((row) => ({
        team: refs.get(row.teamId)!,
        played: row.played,
        lost: row.lost,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
        points: row.points,
        position: row.position,
        withdrawn: row.withdrawnAt !== null,
      }));
      views.sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
          b.points - a.points ||
          a.team.name.localeCompare(b.team.name),
      );
      return { category, rows: views };
    }).filter((table) => table.rows.length > 0);
    return {
      leagueId,
      updatedAt: league.standingsUpdatedAt,
      finalizedAt: league.standingsFinalizedAt,
      tables,
    };
  }

  /** Replaces one category's table; the order of `rows` is the table order. */
  async save(actor: Actor, leagueId: string, category: Category, rows: StandingsRowInput[]) {
    await this.db.transaction(async (tx) => {
      const [league] = await tx
        .select()
        .from(leagues)
        .where(eq(leagues.id, leagueId))
        .for('update');
      if (!league) throw new DomainError('NOT_FOUND');
      if (league.standingsFinalizedAt) throw new DomainError('STANDINGS_FINAL');

      const current = await tx
        .select()
        .from(leagueTeams)
        .where(and(eq(leagueTeams.leagueId, leagueId), eq(leagueTeams.category, category)));
      const ids = rows.map((row) => row.teamId);
      const sameTeams =
        new Set(ids).size === ids.length &&
        ids.length === current.length &&
        current.every((row) => ids.includes(row.teamId));
      if (!sameTeams || rows.some((row) => row.lost > row.played))
        throw new DomainError('BAD_TABLE');

      for (const [index, row] of rows.entries()) {
        const before = current.find((c) => c.teamId === row.teamId)!;
        await tx
          .update(leagueTeams)
          .set({
            played: row.played,
            lost: row.lost,
            setsWon: row.setsWon,
            setsLost: row.setsLost,
            points: row.points,
            position: index + 1,
            withdrawnAt: row.withdrawn ? (before.withdrawnAt ?? new Date()) : null,
            updatedByAdminId: actor.type === 'admin' ? actor.id : null,
          })
          .where(eq(leagueTeams.id, before.id));
      }
      await tx
        .update(leagues)
        .set({ standingsUpdatedAt: new Date() })
        .where(eq(leagues.id, leagueId));
      await this.audit.record(tx, actor, {
        action: 'standings.saved',
        targetType: 'league',
        targetId: leagueId,
        metadata: { category },
        before: {
          rows: current.sort((a, b) => (a.position ?? 99) - (b.position ?? 99)).map(tableRow),
        },
        after: { rows },
      });
    });
    this.cache.invalidate('public:');
    return this.get(leagueId);
  }

  /** The table computed from confirmed results, for staff to review before saving. */
  async fromResults(leagueId: string, category: Category): Promise<StandingsRowInput[]> {
    const [league] = await this.db.select().from(leagues).where(eq(leagues.id, leagueId));
    if (!league) throw new DomainError('NOT_FOUND');
    const teamRows = await this.db
      .select()
      .from(leagueTeams)
      .where(and(eq(leagueTeams.leagueId, leagueId), eq(leagueTeams.category, category)));
    const results = await this.db
      .select({
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        homeSets: matchResults.homeSets,
        awaySets: matchResults.awaySets,
      })
      .from(matches)
      .innerJoin(matchDays, eq(matchDays.id, matches.matchDayId))
      .innerJoin(
        matchResults,
        and(eq(matchResults.matchId, matches.id), eq(matchResults.status, 'confirmed')),
      )
      .where(
        and(
          eq(matchDays.leagueId, leagueId),
          eq(matches.category, category),
          eq(matches.status, 'final'),
          isNull(matchDays.cancelledAt),
        ),
      );
    const computed = standingsFromResults(
      teamRows.map((row) => row.teamId),
      results,
      league.standingsPointsSystem,
    );
    const refs = await this.read.teamRefs(teamRows.map((row) => row.teamId));
    const names = Object.fromEntries([...refs.values()].map((team) => [team.id, team.name]));
    const order = defaultStandingsOrder(computed, names);
    const byId = new Map(computed.map((row) => [row.teamId, row]));
    const withdrawn = new Set(teamRows.filter((row) => row.withdrawnAt).map((row) => row.teamId));
    return order.map((teamId) => {
      const row = byId.get(teamId)!;
      return {
        teamId,
        played: row.played,
        lost: row.lost,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
        points: row.points,
        withdrawn: withdrawn.has(teamId),
      };
    });
  }

  /** Locks both tables as the official final standings. */
  async finalize(actor: Actor, leagueId: string): Promise<AdminStandings> {
    await this.db.transaction(async (tx) => {
      const [league] = await tx
        .select()
        .from(leagues)
        .where(eq(leagues.id, leagueId))
        .for('update');
      if (!league) throw new DomainError('NOT_FOUND');
      if (league.standingsFinalizedAt) return;
      const unpositioned = await tx
        .select({ id: leagueTeams.id })
        .from(leagueTeams)
        .where(and(eq(leagueTeams.leagueId, leagueId), isNull(leagueTeams.position)));
      if (unpositioned.length > 0) throw new DomainError('BAD_TABLE');
      await tx
        .update(leagues)
        .set({
          standingsFinalizedAt: new Date(),
          standingsFinalizedByAdminId: actor.type === 'admin' ? actor.id : null,
        })
        .where(eq(leagues.id, leagueId));
      await this.audit.record(tx, actor, {
        action: 'standings.finalized',
        targetType: 'league',
        targetId: leagueId,
      });
    });
    this.cache.invalidate('public:');
    return this.get(leagueId);
  }

  /** Final (or current) team order per category, for jackpot scoring. Withdrawn teams are left out. */
  async orders(
    leagueId: string,
    executor: Executor = this.db,
  ): Promise<Record<Category, string[]>> {
    const rows = await executor
      .select()
      .from(leagueTeams)
      .where(and(eq(leagueTeams.leagueId, leagueId), isNull(leagueTeams.withdrawnAt)));
    const orders = { men: [] as string[], women: [] as string[] };
    for (const category of CATEGORIES) {
      orders[category] = rows
        .filter((row) => row.category === category)
        .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || b.points - a.points)
        .map((row) => row.teamId);
    }
    return orders;
  }

  async teamNames(leagueId: string, executor: Executor = this.db): Promise<Record<string, string>> {
    const rows = await executor
      .select()
      .from(leagueTeams)
      .where(eq(leagueTeams.leagueId, leagueId));
    const refs = await this.read.teamRefs(
      rows.map((row) => row.teamId),
      executor,
    );
    return Object.fromEntries([...refs.values()].map((team) => [team.id, team.name]));
  }

  static readonly categories = CATEGORIES;
}

const tableRow = (row: typeof leagueTeams.$inferSelect) => ({
  teamId: row.teamId,
  played: row.played,
  lost: row.lost,
  setsWon: row.setsWon,
  setsLost: row.setsLost,
  points: row.points,
  withdrawn: row.withdrawnAt !== null,
});
