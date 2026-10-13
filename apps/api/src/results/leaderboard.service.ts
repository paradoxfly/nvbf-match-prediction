import { Inject, Injectable } from '@nestjs/common';
import type { LeaderboardRow, LeaderboardView, MyStanding } from '@predict/contracts';
import {
  and,
  asc,
  eq,
  entries,
  inArray,
  isNull,
  leaderboardRows,
  matchDays,
  matches,
  matchResults,
  predictionRevisions,
  prizeContributions,
  sql,
  users,
  type Database,
  type Executor,
} from '@predict/db';
import {
  allocatePrizes,
  computePool,
  lockAt,
  paymentCountsForMatch,
  pickCountedRevision,
  rankEntries,
  scoreEntry,
  type CountedPrediction,
  type EntryScore,
  type MatchOutcome,
  type PoolBreakdown,
  type PrizeAllocation,
  type RankedEntry,
} from '@predict/domain';
import { DomainError } from '../common/domain-error';
import { dayTiming, matchTiming, type DayRow } from '../contest/contest-read.service';
import { TtlCache } from '../contest/ttl-cache';
import { DB } from '../database/database.module';
import { PublicService } from '../public/public.service';

export interface ComputedRow {
  entryId: string;
  userId: string;
  displayName: string;
  ranked: RankedEntry;
  prizeKobo: number;
}

export interface ComputedLeaderboard {
  day: DayRow;
  totalMatches: number;
  scoredMatches: number;
  rows: ComputedRow[];
  unranked: Array<{
    entryId: string;
    userId: string;
    displayName: string;
    reason: string;
    score: EntryScore | null;
  }>;
  pool: PoolBreakdown;
  confirmedCount: number;
  allocation: PrizeAllocation;
}

/**
 * The day's leaderboard, computed from source on read (and cached per scoring revision), so it
 * can never be stale or half-updated. Persisted rows only exist for finalized days.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly publicService: PublicService,
    private readonly cache: TtlCache,
  ) {}

  /** Live computation. Pass the finalize transaction to compute inside it. */
  async compute(day: DayRow, executor: Executor = this.db): Promise<ComputedLeaderboard> {
    const dayMatches = await executor.select().from(matches).where(eq(matches.matchDayId, day.id));
    const results = dayMatches.length
      ? await executor
          .select()
          .from(matchResults)
          .where(
            and(
              inArray(
                matchResults.matchId,
                dayMatches.map((m) => m.id),
              ),
              eq(matchResults.status, 'confirmed'),
            ),
          )
      : [];
    const resultByMatch = new Map(results.map((r) => [r.matchId, r]));
    const outcomes: MatchOutcome[] = dayMatches.map((match) => ({
      matchId: match.id,
      status: match.status,
      result: match.status === 'final' ? (resultByMatch.get(match.id)?.sets ?? null) : null,
    }));

    const confirmed = await executor
      .select({ entry: entries, displayName: users.displayName })
      .from(entries)
      .innerJoin(users, eq(users.id, entries.userId))
      .where(and(eq(entries.matchDayId, day.id), eq(entries.status, 'confirmed')));
    const revisions = confirmed.length
      ? await executor
          .select()
          .from(predictionRevisions)
          .where(
            inArray(
              predictionRevisions.entryId,
              confirmed.map((c) => c.entry.id),
            ),
          )
          .orderBy(asc(predictionRevisions.savedAt))
      : [];
    const byEntryMatch = new Map<string, typeof revisions>();
    for (const revision of revisions) {
      const key = `${revision.entryId}:${revision.matchId}`;
      const list = byEntryMatch.get(key) ?? [];
      list.push(revision);
      byEntryMatch.set(key, list);
    }

    const timing = dayTiming(day);
    const scores = new Map<string, EntryScore>();
    const inputs = confirmed.map(({ entry }) => {
      const counted: CountedPrediction[] = [];
      for (const match of dayMatches) {
        if (match.status === 'void') continue;
        if (!paymentCountsForMatch(entry.creditedAt, matchTiming(match), timing)) continue;
        const pick = pickCountedRevision(
          byEntryMatch.get(`${entry.id}:${match.id}`) ?? [],
          lockAt(matchTiming(match), timing),
        );
        if (pick) counted.push({ matchId: match.id, sets: pick.sets });
      }
      const score = scoreEntry(counted, outcomes, day.scoring);
      scores.set(entry.id, score);
      return {
        entryId: entry.id,
        score,
        eligible: entry.disqualifiedAt === null && score.countedPredictions > 0,
      };
    });
    const ranked = rankEntries(inputs, day.tieBreakers);

    const [extra] = await executor
      .select({ total: sql<string | null>`sum(${prizeContributions.amountKobo})` })
      .from(prizeContributions)
      .where(
        and(eq(prizeContributions.matchDayId, day.id), eq(prizeContributions.status, 'allocated')),
      );
    const pool = computePool({
      confirmedCount: confirmed.length,
      entryFeeKobo: day.entryFeeKobo,
      prizeBps: day.prizeBps,
      jackpotBps: day.jackpotBps,
      contributionsKobo: Number(extra?.total ?? 0),
    });
    const allocation = allocatePrizes(pool.dailyPoolKobo, day.prizeTiersBps, ranked);
    const prizes = new Map(allocation.awards.map((award) => [award.entryId, award.amountKobo]));
    const byId = new Map(confirmed.map((c) => [c.entry.id, c]));
    const rankedIds = new Set(ranked.map((entry) => entry.entryId));

    return {
      day,
      totalMatches: dayMatches.filter((m) => m.status !== 'void').length,
      scoredMatches: outcomes.filter((o) => o.status === 'final' && o.result).length,
      rows: ranked.map((entry) => ({
        entryId: entry.entryId,
        userId: byId.get(entry.entryId)!.entry.userId,
        displayName: byId.get(entry.entryId)!.displayName,
        ranked: entry,
        prizeKobo: prizes.get(entry.entryId) ?? 0,
      })),
      unranked: confirmed
        .filter(({ entry }) => !rankedIds.has(entry.id))
        .map(({ entry, displayName }) => ({
          entryId: entry.id,
          userId: entry.userId,
          displayName,
          reason: entry.disqualifiedAt
            ? `Disqualified: ${entry.disqualifiedReason ?? 'duplicate account'}`
            : 'No picks that count yet',
          score: scores.get(entry.id) ?? null,
        })),
      pool,
      confirmedCount: confirmed.length,
      allocation,
    };
  }

  /** Cached by the day's scoring revision, which every relevant change bumps. */
  cached(day: DayRow): Promise<ComputedLeaderboard> {
    return this.cache.get(`leaderboard:${day.id}:${day.scoringRev}`, 60_000, () =>
      this.compute(day),
    );
  }

  async publicView(date: string, limit: number): Promise<LeaderboardView> {
    const day = await this.requireDay(date);
    if (day.finalizedAt) return this.persistedView(day, limit);
    const board = await this.cached(day);
    return {
      date: day.date,
      final: false,
      scoredMatches: board.scoredMatches,
      totalMatches: board.totalMatches,
      totalPlayers: board.rows.length,
      rows: board.rows
        .slice(0, limit)
        .map((row) => toRow(row.displayName, row.ranked, row.prizeKobo)),
      updatedAt: new Date(),
    };
  }

  async mine(userId: string, date: string): Promise<MyStanding> {
    const day = await this.requireDay(date);
    const [entry] = await this.db
      .select()
      .from(entries)
      .where(and(eq(entries.matchDayId, day.id), eq(entries.userId, userId)));
    if (!entry) return { row: null, reason: "You didn't enter this day." };
    if (entry.status !== 'confirmed') return { row: null, reason: "Your payment isn't confirmed." };
    if (entry.disqualifiedAt) return { row: null, reason: 'This entry was disqualified.' };

    if (day.finalizedAt) {
      const [row] = await this.db
        .select()
        .from(leaderboardRows)
        .where(and(eq(leaderboardRows.entryId, entry.id), isNull(leaderboardRows.supersededAt)));
      if (!row) return { row: null, reason: 'None of your picks counted.' };
      return { row: persistedRow(row), reason: null };
    }
    const board = await this.cached(day);
    const row = board.rows.find((r) => r.entryId === entry.id);
    if (!row) return { row: null, reason: 'None of your picks count yet.' };
    return { row: toRow(row.displayName, row.ranked, row.prizeKobo), reason: null };
  }

  private async persistedView(day: DayRow, limit: number): Promise<LeaderboardView> {
    const rows = await this.db
      .select()
      .from(leaderboardRows)
      .where(and(eq(leaderboardRows.matchDayId, day.id), isNull(leaderboardRows.supersededAt)))
      .orderBy(asc(leaderboardRows.rank), asc(leaderboardRows.entryId));
    const dayMatches = await this.db.select().from(matches).where(eq(matches.matchDayId, day.id));
    const played = dayMatches.filter((m) => m.status === 'final').length;
    return {
      date: day.date,
      final: true,
      scoredMatches: played,
      totalMatches: dayMatches.filter((m) => m.status !== 'void').length,
      totalPlayers: rows.length,
      rows: rows.slice(0, limit).map(persistedRow),
      updatedAt: day.finalizedAt ?? new Date(),
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

export function toRow(displayName: string, entry: RankedEntry, prizeKobo: number): LeaderboardRow {
  return {
    rank: entry.rank,
    tied: entry.groupSize > 1,
    displayName,
    points: entry.score.points,
    closeness: entry.score.closeness,
    exactCount: entry.score.exactCount,
    winnerCount: entry.score.winnerCount,
    prizeKobo: prizeKobo > 0 ? prizeKobo : null,
  };
}

function persistedRow(row: typeof leaderboardRows.$inferSelect): LeaderboardRow {
  return {
    rank: row.rank,
    tied: row.groupSize > 1,
    displayName: row.displayName,
    points: row.points,
    closeness: row.closeness,
    exactCount: row.exactCount,
    winnerCount: row.winnerCount,
    prizeKobo: row.prizeKobo > 0 ? row.prizeKobo : null,
  };
}
