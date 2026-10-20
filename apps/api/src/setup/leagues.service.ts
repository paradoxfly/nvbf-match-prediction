import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_STANDINGS_POINTS,
  type Category,
  type CreateLeagueInput,
  type DayConfig,
  type LeagueTeamView,
  type LeagueView,
  type UpdateLeagueInput,
} from '@predict/contracts';
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  isNull,
  jackpotEntries,
  jackpots,
  leagues,
  leagueTeams,
  matchDays,
  matches,
  prizeContributions,
  sql,
  sum,
  teams,
  type Database,
  type Executor,
} from '@predict/db';
import { watToUtc } from '@predict/domain';
import { AuditService, type Actor } from '../common/audit.service';
import { DomainError } from '../common/domain-error';
import { ContestReadService } from '../contest/contest-read.service';
import { DB } from '../database/database.module';
import { readFixtureCsv } from './fixtures-csv';
import { SettingsService } from './settings.service';

type LeagueRow = typeof leagues.$inferSelect;

/** Columns a new match-day copies from its league's defaults. */
export function dayValuesFromConfig(config: DayConfig) {
  return {
    entryFeeKobo: config.entryFeeKobo,
    prizeBps: config.prizeBps,
    jackpotBps: config.jackpotBps,
    prizeTiersBps: config.prizeTiersBps,
    scoring: config.scoring,
    format: config.format,
    tieBreakers: config.tieBreakers,
    lockLeadMin: config.lockLeadMin,
    minScoredMatches: config.minScoredMatches,
  };
}

export interface FixtureImportResult {
  rows: Array<{
    line: number;
    date: string;
    time: string;
    home: string;
    away: string;
    category: Category | null;
    error: string | null;
  }>;
  newDays: string[];
  valid: boolean;
  committed: boolean;
}

@Injectable()
export class LeaguesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly read: ContestReadService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        league: leagues,
        dayCount: countDistinct(matchDays.id),
        teamCount: countDistinct(leagueTeams.id),
      })
      .from(leagues)
      .leftJoin(matchDays, eq(matchDays.leagueId, leagues.id))
      .leftJoin(leagueTeams, eq(leagueTeams.leagueId, leagues.id))
      .groupBy(leagues.id)
      .orderBy(sql`${leagues.startDate} desc`);
    return rows.map((row) => ({
      id: row.league.id,
      name: row.league.name,
      status: row.league.status,
      startDate: row.league.startDate,
      endDate: row.league.endDate,
      dayCount: row.dayCount,
      teamCount: row.teamCount,
    }));
  }

  async get(id: string): Promise<LeagueView> {
    const league = await this.require(this.db, id);
    const [teamRows, jackpot, days] = await Promise.all([
      this.db
        .select()
        .from(leagueTeams)
        .where(eq(leagueTeams.leagueId, id))
        .orderBy(asc(leagueTeams.category), asc(leagueTeams.position)),
      this.jackpotSummary(id),
      this.db
        .select()
        .from(matchDays)
        .where(eq(matchDays.leagueId, id))
        .orderBy(asc(matchDays.date)),
    ]);
    const refs = await this.read.teamRefs(teamRows.map((row) => row.teamId));
    const teamViews: LeagueTeamView[] = teamRows
      .map((row) => ({
        team: refs.get(row.teamId)!,
        played: row.played,
        lost: row.lost,
        setsWon: row.setsWon,
        setsLost: row.setsLost,
        points: row.points,
        position: row.position,
        withdrawn: row.withdrawnAt !== null,
      }))
      .sort(
        (a, b) =>
          a.team.category.localeCompare(b.team.category) ||
          (a.position ?? 999) - (b.position ?? 999) ||
          a.team.name.localeCompare(b.team.name),
      );

    return {
      id: league.id,
      name: league.name,
      status: league.status,
      startDate: league.startDate,
      endDate: league.endDate,
      defaults: league.defaults,
      standingsPublic: league.standingsPublic,
      standingsPointsSystem: league.standingsPointsSystem,
      standingsUpdatedAt: league.standingsUpdatedAt,
      standingsFinalizedAt: league.standingsFinalizedAt,
      teams: teamViews,
      jackpot,
      days: await this.read.dayCards(days),
    };
  }

  async create(actor: Actor, input: CreateLeagueInput): Promise<LeagueView> {
    if (input.endDate < input.startDate) throw new DomainError('INVALID_DATES');
    const defaults = input.defaults ?? (await this.settings.row()).defaultDayConfig;
    const id = await this.db.transaction(async (tx) => {
      const [league] = await tx
        .insert(leagues)
        .values({
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          defaults,
          standingsPointsSystem: DEFAULT_STANDINGS_POINTS,
        })
        .returning();
      await tx.insert(jackpots).values({
        leagueId: league!.id,
        entryClosesAt: watToUtc(input.jackpotEntryClosesOn, input.jackpotEntryClosesAt),
      });
      await this.audit.record(tx, actor, {
        action: 'league.created',
        targetType: 'league',
        targetId: league!.id,
        after: { name: league!.name, startDate: league!.startDate, endDate: league!.endDate },
      });
      return league!.id;
    });
    return this.get(id);
  }

  async update(actor: Actor, input: UpdateLeagueInput): Promise<LeagueView> {
    await this.db.transaction(async (tx) => {
      const league = await this.require(tx, input.id, true);
      if (league.status === 'completed') throw new DomainError('LEAGUE_LOCKED');
      const startDate = input.startDate ?? league.startDate;
      const endDate = input.endDate ?? league.endDate;
      if (endDate < startDate) throw new DomainError('INVALID_DATES');
      if (input.startDate || input.endDate) {
        const [outside] = await tx
          .select({ n: count() })
          .from(matchDays)
          .where(
            and(
              eq(matchDays.leagueId, league.id),
              sql`(${matchDays.date} < ${startDate} or ${matchDays.date} > ${endDate})`,
            ),
          );
        if ((outside?.n ?? 0) > 0) throw new DomainError('DATE_OUTSIDE_LEAGUE');
      }
      const [after] = await tx
        .update(leagues)
        .set({
          name: input.name,
          startDate: input.startDate,
          endDate: input.endDate,
          defaults: input.defaults,
          standingsPublic: input.standingsPublic,
          standingsPointsSystem: input.standingsPointsSystem,
        })
        .where(eq(leagues.id, league.id))
        .returning();
      await this.audit.record(tx, actor, {
        action: 'league.updated',
        targetType: 'league',
        targetId: league.id,
        before: summary(league),
        after: summary(after!),
      });
    });
    return this.get(input.id);
  }

  /**
   * Sets which teams play in the league. While the league is a draft anything goes; once it
   * is running teams can only be added (removing one would rewrite jackpot predictions).
   */
  async setTeams(actor: Actor, id: string, teamIds: string[]): Promise<LeagueView> {
    await this.db.transaction(async (tx) => {
      const league = await this.require(tx, id, true);
      if (league.status === 'completed') throw new DomainError('LEAGUE_LOCKED');
      const wanted = [...new Set(teamIds)];
      const found = wanted.length
        ? await tx
            .select()
            .from(teams)
            .where(and(inArray(teams.id, wanted), isNull(teams.archivedAt)))
        : [];
      if (found.length !== wanted.length) throw new DomainError('NOT_FOUND');

      const existing = await tx.select().from(leagueTeams).where(eq(leagueTeams.leagueId, id));
      const removed = existing.filter((row) => !wanted.includes(row.teamId));
      if (removed.length > 0) {
        if (league.status !== 'draft') throw new DomainError('LEAGUE_LOCKED');
        const removedIds = removed.map((row) => row.teamId);
        const [used] = await tx
          .select({ n: count() })
          .from(matches)
          .innerJoin(matchDays, eq(matchDays.id, matches.matchDayId))
          .where(
            and(
              eq(matchDays.leagueId, id),
              sql`(${inArray(matches.homeTeamId, removedIds)} or ${inArray(matches.awayTeamId, removedIds)})`,
            ),
          );
        if ((used?.n ?? 0) > 0) throw new DomainError('LEAGUE_LOCKED');
        await tx
          .delete(leagueTeams)
          .where(and(eq(leagueTeams.leagueId, id), inArray(leagueTeams.teamId, removedIds)));
      }
      const existingIds = new Set(existing.map((row) => row.teamId));
      const added = found.filter((team) => !existingIds.has(team.id));
      if (added.length > 0) {
        await tx
          .insert(leagueTeams)
          .values(
            added.map((team) => ({ leagueId: id, teamId: team.id, category: team.category })),
          );
      }
      await this.audit.record(tx, actor, {
        action: 'league.teams_set',
        targetType: 'league',
        targetId: id,
        before: { teamIds: existing.map((row) => row.teamId) },
        after: { teamIds: wanted },
      });
    });
    return this.get(id);
  }

  async activate(actor: Actor, id: string): Promise<LeagueView> {
    await this.db.transaction(async (tx) => {
      const league = await this.require(tx, id, true);
      if (league.status === 'active') return;
      if (league.status !== 'draft') throw new DomainError('LEAGUE_LOCKED');
      const perCategory = await tx
        .select({ category: leagueTeams.category, n: count() })
        .from(leagueTeams)
        .where(eq(leagueTeams.leagueId, id))
        .groupBy(leagueTeams.category);
      if (!perCategory.some((row) => row.n >= 2)) throw new DomainError('NOT_ENOUGH_TEAMS');
      await tx.update(leagues).set({ status: 'active' }).where(eq(leagues.id, id));
      await this.audit.record(tx, actor, {
        action: 'league.activated',
        targetType: 'league',
        targetId: id,
      });
    });
    return this.get(id);
  }

  /**
   * Moves the jackpot entry deadline, earlier or later, until the jackpot is settled. Players
   * already in can change their tables until it passes. A time that has already passed closes
   * entries now; a later time reopens a closed jackpot.
   */
  async setJackpotClose(actor: Actor, id: string, date: string, time: string): Promise<LeagueView> {
    const requested = watToUtc(date, time);
    await this.db.transaction(async (tx) => {
      const [jackpot] = await tx
        .select()
        .from(jackpots)
        .where(eq(jackpots.leagueId, id))
        .for('update');
      if (!jackpot) throw new DomainError('NOT_FOUND');
      if (jackpot.status === 'settled' || jackpot.status === 'carried_over') {
        throw new DomainError('LEAGUE_LOCKED');
      }
      // Never record a close before saves that already happened.
      const now = new Date();
      const open = requested > now;
      const closesAt = open ? requested : now;
      await tx
        .update(jackpots)
        .set({ entryClosesAt: closesAt, status: open ? 'open' : 'closed' })
        .where(eq(jackpots.id, jackpot.id));
      await this.audit.record(tx, actor, {
        action: 'jackpot.close_time_changed',
        targetType: 'jackpot',
        targetId: jackpot.id,
        before: { entryClosesAt: jackpot.entryClosesAt },
        after: { entryClosesAt: closesAt },
      });
    });
    return this.get(id);
  }

  /** Creates draft days (copying the league defaults) for each date not already used. */
  async createDays(actor: Actor, id: string, dates: string[]) {
    return this.db.transaction(async (tx) => {
      const league = await this.require(tx, id, true);
      if (league.status === 'completed') throw new DomainError('LEAGUE_LOCKED');
      const unique = [...new Set(dates)].sort();
      if (unique.some((date) => date < league.startDate || date > league.endDate)) {
        throw new DomainError('DATE_OUTSIDE_LEAGUE');
      }
      const created = await tx
        .insert(matchDays)
        .values(
          unique.map((date) => ({ leagueId: id, date, ...dayValuesFromConfig(league.defaults) })),
        )
        .onConflictDoNothing()
        .returning({ date: matchDays.date });
      const createdDates = new Set(created.map((row) => row.date));
      await this.audit.record(tx, actor, {
        action: 'league.days_created',
        targetType: 'league',
        targetId: id,
        after: { dates: [...createdDates] },
      });
      return { created: created.length, skipped: unique.filter((date) => !createdDates.has(date)) };
    });
  }

  /**
   * Checks (and with `commit`, applies) a fixture list. Days that don't exist yet are created;
   * days that have already opened can't take new matches. Teams must already exist.
   */
  async importFixtures(
    actor: Actor,
    id: string,
    csv: string,
    commit: boolean,
  ): Promise<FixtureImportResult> {
    return this.db.transaction(async (tx) => {
      const league = await this.require(tx, id, commit);
      if (league.status === 'completed') throw new DomainError('LEAGUE_LOCKED');
      const lines = readFixtureCsv(csv);

      const allTeams = await tx.select().from(teams).where(isNull(teams.archivedAt));
      const inLeague = new Set(
        (await tx.select().from(leagueTeams).where(eq(leagueTeams.leagueId, id))).map(
          (r) => r.teamId,
        ),
      );
      const days = await tx.select().from(matchDays).where(eq(matchDays.leagueId, id));
      const dayByDate = new Map(days.map((day) => [day.date, day]));
      const existingMatches = days.length
        ? await tx
            .select()
            .from(matches)
            .where(
              inArray(
                matches.matchDayId,
                days.map((day) => day.id),
              ),
            )
        : [];
      const seen = new Set(
        existingMatches.map(
          (m) => `${days.find((d) => d.id === m.matchDayId)!.date}|${m.homeTeamId}|${m.awayTeamId}`,
        ),
      );

      const findTeams = (name: string, category: Category | null) => {
        const key = name.trim().toLowerCase();
        return allTeams.filter(
          (team) =>
            (team.name.toLowerCase() === key || team.shortName.toLowerCase() === key) &&
            (!category || team.category === category),
        );
      };

      const toAddToLeague = new Set<string>();
      const resolved: Array<{
        date: string;
        time: string;
        homeId: string;
        awayId: string;
        category: Category;
        venue: string | null;
      }> = [];
      const rows = lines.map((line) => {
        const errors = [...line.errors];
        let category = line.category;
        let homeId: string | null = null;
        let awayId: string | null = null;
        if (errors.length === 0) {
          const homes = findTeams(line.home, category);
          const aways = findTeams(line.away, category);
          if (homes.length === 0)
            errors.push(`No team called "${line.home}"${category ? ` (${category})` : ''}.`);
          if (aways.length === 0)
            errors.push(`No team called "${line.away}"${category ? ` (${category})` : ''}.`);
          if (homes.length > 1 || aways.length > 1) {
            errors.push(
              'That team name exists in both categories: add a category column (men or women).',
            );
          }
          if (homes.length === 1 && aways.length === 1) {
            const [home, away] = [homes[0]!, aways[0]!];
            if (home.id === away.id) errors.push('A team cannot play itself.');
            else if (home.category !== away.category)
              errors.push('Both teams must be in the same category.');
            else {
              category = home.category;
              homeId = home.id;
              awayId = away.id;
            }
          }
        }
        if (errors.length === 0 && homeId && awayId) {
          if (line.date < league.startDate || line.date > league.endDate) {
            errors.push(
              `${line.date} is outside the league (${league.startDate} to ${league.endDate}).`,
            );
          }
          const day = dayByDate.get(line.date);
          if (day && day.status !== 'draft' && day.status !== 'published') {
            errors.push(`The ${line.date} match-day has already opened.`);
          }
          for (const teamId of [homeId, awayId]) {
            if (!inLeague.has(teamId)) {
              if (league.status === 'draft') toAddToLeague.add(teamId);
              else
                errors.push(
                  `${allTeams.find((t) => t.id === teamId)!.name} is not in this league.`,
                );
            }
          }
          const key = `${line.date}|${homeId}|${awayId}`;
          if (seen.has(key)) errors.push('This match is already listed for that day.');
          seen.add(key);
        }
        if (errors.length === 0 && homeId && awayId && category) {
          resolved.push({
            date: line.date,
            time: line.time,
            homeId,
            awayId,
            category,
            venue: line.venue,
          });
        }
        return {
          line: line.line,
          date: line.date,
          time: line.time,
          home: line.home,
          away: line.away,
          category,
          error: errors.length ? errors.join(' ') : null,
        };
      });

      const valid = rows.length > 0 && rows.every((row) => row.error === null);
      const newDays = [...new Set(resolved.map((r) => r.date))]
        .filter((date) => !dayByDate.has(date))
        .sort();
      if (!commit || !valid) return { rows, newDays, valid, committed: false };

      if (toAddToLeague.size > 0) {
        const added = allTeams.filter((team) => toAddToLeague.has(team.id));
        await tx
          .insert(leagueTeams)
          .values(
            added.map((team) => ({ leagueId: id, teamId: team.id, category: team.category })),
          );
      }
      if (newDays.length > 0) {
        const created = await tx
          .insert(matchDays)
          .values(
            newDays.map((date) => ({
              leagueId: id,
              date,
              ...dayValuesFromConfig(league.defaults),
            })),
          )
          .returning();
        for (const day of created) dayByDate.set(day.date, day);
      }
      const ordered = [...resolved].sort((a, b) =>
        `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
      );
      await tx.insert(matches).values(
        ordered.map((fixture, index) => ({
          matchDayId: dayByDate.get(fixture.date)!.id,
          homeTeamId: fixture.homeId,
          awayTeamId: fixture.awayId,
          category: fixture.category,
          scheduledAt: watToUtc(fixture.date, fixture.time),
          venue: fixture.venue,
          displayOrder: index,
        })),
      );
      await this.audit.record(tx, actor, {
        action: 'fixtures.imported',
        targetType: 'league',
        targetId: id,
        metadata: { matches: ordered.length, newDays, teamsAdded: [...toAddToLeague] },
      });
      return { rows, newDays, valid, committed: true };
    });
  }

  private async require(executor: Executor, id: string, forUpdate = false): Promise<LeagueRow> {
    const query = executor.select().from(leagues).where(eq(leagues.id, id));
    const [league] = forUpdate ? await query.for('update') : await query;
    if (!league) throw new DomainError('NOT_FOUND');
    return league;
  }

  private async jackpotSummary(leagueId: string) {
    const [jackpot] = await this.db.select().from(jackpots).where(eq(jackpots.leagueId, leagueId));
    if (!jackpot) return null;
    const [[entered], [cuts], [extra]] = await Promise.all([
      this.db
        .select({ n: count() })
        .from(jackpotEntries)
        .where(eq(jackpotEntries.jackpotId, jackpot.id)),
      this.db
        .select({ total: sum(matchDays.finalJackpotCutKobo) })
        .from(matchDays)
        .where(and(eq(matchDays.leagueId, leagueId), isNotNull(matchDays.finalizedAt))),
      this.db
        .select({ total: sum(prizeContributions.amountKobo) })
        .from(prizeContributions)
        .where(
          and(
            eq(prizeContributions.jackpotId, jackpot.id),
            eq(prizeContributions.status, 'allocated'),
          ),
        ),
    ]);
    return {
      id: jackpot.id,
      status: jackpot.status,
      entryClosesAt: jackpot.entryClosesAt,
      entries: entered?.n ?? 0,
      guaranteedKobo: Number(cuts?.total ?? 0) + Number(extra?.total ?? 0),
    };
  }
}

const summary = (league: LeagueRow) => ({
  name: league.name,
  startDate: league.startDate,
  endDate: league.endDate,
  defaults: league.defaults,
  standingsPublic: league.standingsPublic,
});
