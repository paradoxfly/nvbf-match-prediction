import { Inject, Injectable } from '@nestjs/common';
import type {
  DayCard,
  DayConfig,
  DayRulesSummary,
  MatchView,
  PoolView,
  SponsorView,
  TeamRef,
} from '@predict/contracts';
import {
  and,
  count,
  eq,
  entries,
  inArray,
  isNull,
  leaderboardRows,
  matchDays,
  matches,
  matchResults,
  mediaAssets,
  prizeContributions,
  sql,
  teams,
  type Database,
  type Executor,
} from '@predict/db';
import {
  computePool,
  isMatchLocked,
  lockAt,
  placeAmounts,
  type DayTiming,
  type MatchTiming,
} from '@predict/domain';
import { DB } from '../database/database.module';
import { MediaService } from '../media/media.service';

export type DayRow = typeof matchDays.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;

export const dayTiming = (day: DayRow): DayTiming => ({
  status: day.status,
  closedAt: day.closedAt,
  submissionsCloseAt: day.submissionsCloseAt,
  lockLeadMin: day.lockLeadMin,
});

export const matchTiming = (match: MatchRow): MatchTiming => ({
  status: match.status,
  scheduledAt: match.scheduledAt,
  actualStartAt: match.actualStartAt,
  lockedAt: match.lockedAt,
});

export const dayConfig = (day: DayRow): DayConfig => ({
  entryFeeKobo: day.entryFeeKobo,
  prizeBps: day.prizeBps,
  jackpotBps: day.jackpotBps,
  prizeTiersBps: day.prizeTiersBps,
  scoring: day.scoring,
  format: day.format,
  tieBreakers: day.tieBreakers,
  lockLeadMin: day.lockLeadMin,
  minScoredMatches: day.minScoredMatches,
});

export const dayRulesSummary = (day: DayRow): DayRulesSummary => ({
  entryFeeKobo: day.entryFeeKobo,
  prizeBps: day.prizeBps,
  jackpotBps: day.jackpotBps,
  prizeTiersBps: day.prizeTiersBps,
  scoring: day.scoring,
  format: day.format,
  tieBreakers: day.tieBreakers,
  lockLeadMin: day.lockLeadMin,
});

/** Read models shared by the public pages, the player flow and the admin screens. */
@Injectable()
export class ContestReadService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly media: MediaService,
  ) {}

  async teamRefs(teamIds: string[], executor: Executor = this.db): Promise<Map<string, TeamRef>> {
    if (teamIds.length === 0) return new Map();
    const rows = await executor
      .select({
        id: teams.id,
        name: teams.name,
        shortName: teams.shortName,
        category: teams.category,
        logoKey: mediaAssets.storageKey,
        logoStatus: mediaAssets.status,
      })
      .from(teams)
      .leftJoin(mediaAssets, eq(mediaAssets.id, teams.logoMediaId))
      .where(inArray(teams.id, [...new Set(teamIds)]));
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          shortName: row.shortName,
          category: row.category,
          logoUrl: this.media.urlFromKey(row.logoKey, row.logoStatus),
        },
      ]),
    );
  }

  /** Every match of the given days, in display order, with lock state and confirmed result. */
  async matchViews(days: DayRow[], now = new Date()): Promise<Map<string, MatchView[]>> {
    const result = new Map<string, MatchView[]>(days.map((day) => [day.id, []]));
    if (days.length === 0) return result;
    const byId = new Map(days.map((day) => [day.id, day]));

    const rows = await this.db
      .select()
      .from(matches)
      .where(
        inArray(
          matches.matchDayId,
          days.map((day) => day.id),
        ),
      )
      .orderBy(matches.scheduledAt, matches.displayOrder, matches.id);
    const results = rows.length
      ? await this.db
          .select()
          .from(matchResults)
          .where(
            and(
              inArray(
                matchResults.matchId,
                rows.map((row) => row.id),
              ),
              eq(matchResults.status, 'confirmed'),
            ),
          )
      : [];
    const resultByMatch = new Map(results.map((row) => [row.matchId, row]));
    const refs = await this.teamRefs(rows.flatMap((row) => [row.homeTeamId, row.awayTeamId]));

    for (const row of rows) {
      const day = byId.get(row.matchDayId)!;
      const confirmed = resultByMatch.get(row.id);
      result.get(row.matchDayId)!.push({
        id: row.id,
        category: row.category,
        home: refs.get(row.homeTeamId)!,
        away: refs.get(row.awayTeamId)!,
        scheduledAt: row.scheduledAt,
        lockAt: lockAt(matchTiming(row), dayTiming(day)),
        locked: isMatchLocked(matchTiming(row), dayTiming(day), now),
        status: row.status,
        voidReason: row.voidReason,
        venue: row.venue,
        result:
          confirmed && row.status !== 'void'
            ? { sets: confirmed.sets, homeSets: confirmed.homeSets, awaySets: confirmed.awaySets }
            : null,
      });
    }
    return result;
  }

  /** Confirmed entries for each day (disqualified ones included: their fee stays in the pool). */
  async confirmedCounts(dayIds: string[]): Promise<Map<string, number>> {
    if (dayIds.length === 0) return new Map();
    const rows = await this.db
      .select({ dayId: entries.matchDayId, n: count() })
      .from(entries)
      .where(and(inArray(entries.matchDayId, dayIds), eq(entries.status, 'confirmed')))
      .groupBy(entries.matchDayId);
    return new Map(rows.map((row) => [row.dayId, row.n]));
  }

  async dayContributions(dayIds: string[]) {
    const totals = new Map<
      string,
      { allocatedKobo: number; pledgedKobo: number; sponsors: SponsorView[] }
    >(dayIds.map((id) => [id, { allocatedKobo: 0, pledgedKobo: 0, sponsors: [] }]));
    if (dayIds.length === 0) return totals;
    const rows = await this.db
      .select({
        dayId: prizeContributions.matchDayId,
        status: prizeContributions.status,
        source: prizeContributions.source,
        amountKobo: prizeContributions.amountKobo,
        sponsorName: prizeContributions.sponsorName,
        sponsorUrl: prizeContributions.sponsorUrl,
        logoKey: mediaAssets.storageKey,
        logoStatus: mediaAssets.status,
      })
      .from(prizeContributions)
      .leftJoin(mediaAssets, eq(mediaAssets.id, prizeContributions.sponsorLogoMediaId))
      .where(inArray(prizeContributions.matchDayId, dayIds));
    for (const row of rows) {
      const total = totals.get(row.dayId!);
      if (!total) continue;
      if (row.status === 'allocated') {
        total.allocatedKobo += row.amountKobo;
        if (row.source === 'sponsor' && row.sponsorName) {
          total.sponsors.push({
            name: row.sponsorName,
            url: row.sponsorUrl,
            logoUrl: this.media.urlFromKey(row.logoKey, row.logoStatus),
            amountKobo: row.amountKobo,
          });
        }
      } else if (row.status === 'pledged') {
        total.pledgedKobo += row.amountKobo;
      }
    }
    return totals;
  }

  /** The day's money: live from confirmed entries, or frozen once finalized. */
  async pools(days: DayRow[]): Promise<Map<string, PoolView>> {
    const ids = days.map((day) => day.id);
    const [counts, contributions, ranked] = await Promise.all([
      this.confirmedCounts(ids),
      this.dayContributions(ids),
      this.rankedCounts(days.filter((day) => day.finalizedAt).map((day) => day.id)),
    ]);
    const pools = new Map<string, PoolView>();
    for (const day of days) {
      const places = day.prizeTiersBps.length;
      if (day.finalizedAt && day.finalDailyPoolKobo !== null) {
        const eligible = ranked.get(day.id) ?? 0;
        pools.set(day.id, {
          confirmedEntries: day.finalConfirmedCount ?? 0,
          entryFeeKobo: day.entryFeeKobo,
          revenueKobo: day.finalRevenueKobo ?? 0,
          participantShareKobo: day.finalParticipantShareKobo ?? 0,
          jackpotCutKobo: day.finalJackpotCutKobo ?? 0,
          contributionsKobo: day.finalContributionsKobo ?? 0,
          dailyPoolKobo: day.finalDailyPoolKobo,
          placeAmountsKobo: placeAmounts(day.finalDailyPoolKobo, day.prizeTiersBps, eligible),
          fullTableKobo: placeAmounts(day.finalDailyPoolKobo, day.prizeTiersBps, places),
          final: true,
        });
        continue;
      }
      const confirmed = counts.get(day.id) ?? 0;
      const breakdown = computePool({
        confirmedCount: day.status === 'cancelled' ? 0 : confirmed,
        entryFeeKobo: day.entryFeeKobo,
        prizeBps: day.prizeBps,
        jackpotBps: day.jackpotBps,
        contributionsKobo: contributions.get(day.id)?.allocatedKobo ?? 0,
      });
      pools.set(day.id, {
        confirmedEntries: confirmed,
        entryFeeKobo: day.entryFeeKobo,
        revenueKobo: breakdown.revenueKobo,
        participantShareKobo: breakdown.participantShareKobo,
        jackpotCutKobo: breakdown.jackpotCutKobo,
        contributionsKobo: breakdown.contributionsKobo,
        dailyPoolKobo: breakdown.dailyPoolKobo,
        placeAmountsKobo: placeAmounts(breakdown.dailyPoolKobo, day.prizeTiersBps, confirmed),
        fullTableKobo: placeAmounts(breakdown.dailyPoolKobo, day.prizeTiersBps, places),
        final: false,
      });
    }
    return pools;
  }

  async dayCards(days: DayRow[]): Promise<DayCard[]> {
    const ids = days.map((day) => day.id);
    const [pools, matchCounts] = await Promise.all([this.pools(days), this.matchCounts(ids)]);
    return days.map((day) => ({
      id: day.id,
      date: day.date,
      title: day.title,
      status: day.status,
      matchCount: matchCounts.get(day.id) ?? 0,
      confirmedEntries: pools.get(day.id)!.confirmedEntries,
      dailyPoolKobo: pools.get(day.id)!.dailyPoolKobo,
    }));
  }

  private async matchCounts(dayIds: string[]): Promise<Map<string, number>> {
    if (dayIds.length === 0) return new Map();
    const rows = await this.db
      .select({ dayId: matches.matchDayId, n: count() })
      .from(matches)
      .where(and(inArray(matches.matchDayId, dayIds), sql`${matches.status} <> 'void'`))
      .groupBy(matches.matchDayId);
    return new Map(rows.map((row) => [row.dayId, row.n]));
  }

  private async rankedCounts(dayIds: string[]): Promise<Map<string, number>> {
    if (dayIds.length === 0) return new Map();
    const rows = await this.db
      .select({ dayId: leaderboardRows.matchDayId, n: count() })
      .from(leaderboardRows)
      .where(and(inArray(leaderboardRows.matchDayId, dayIds), isNull(leaderboardRows.supersededAt)))
      .groupBy(leaderboardRows.matchDayId);
    return new Map(rows.map((row) => [row.dayId, row.n]));
  }
}
