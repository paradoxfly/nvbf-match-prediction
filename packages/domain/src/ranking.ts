// Daily leaderboard order and competition ranks (1, 2, 2, 4).

import type { EntryScore, RankedEntry, RankInput, TieBreaker } from './types';

/** After points: closest set scores, then most exact scores, then most correct winners. */
export const DEFAULT_TIE_BREAKERS: TieBreaker[] = ['closeness', 'exactScores', 'correctWinners'];

/** Plain code-unit order for ids, the same in every runtime and locale. */
export function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Negative when `a` ranks ahead of `b`, 0 when they are tied on points and every tie-breaker. */
export function compareScores(
  a: EntryScore,
  b: EntryScore,
  tieBreakers: readonly TieBreaker[],
): number {
  if (a.points !== b.points) return b.points - a.points;
  for (const tieBreaker of tieBreakers) {
    switch (tieBreaker) {
      case 'closeness':
        if (a.closeness !== b.closeness) return a.closeness - b.closeness;
        break;
      case 'exactScores':
        if (a.exactCount !== b.exactCount) return b.exactCount - a.exactCount;
        break;
      case 'correctWinners':
        if (a.winnerCount !== b.winnerCount) return b.winnerCount - a.winnerCount;
        break;
      default: {
        const unknown: never = tieBreaker;
        throw new Error(`Unknown tie-breaker: ${String(unknown)}`);
      }
    }
  }
  return 0;
}

/**
 * Ranks eligible entries. Rows tied on points and every tie-breaker form one group that shares a
 * rank; inside a group, entryId order is for display only.
 */
export function rankEntries(
  rows: readonly RankInput[],
  tieBreakers: readonly TieBreaker[],
): RankedEntry[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.entryId)) throw new Error(`Entry ${row.entryId} is listed twice.`);
    seen.add(row.entryId);
  }

  const sorted = rows
    .filter((row) => row.eligible)
    .sort(
      (a, b) => compareScores(a.score, b.score, tieBreakers) || compareIds(a.entryId, b.entryId),
    );

  const ranked: RankedEntry[] = [];
  let start = 0;
  while (start < sorted.length) {
    const first = sorted[start];
    if (first === undefined) break;
    let end = start;
    while (end + 1 < sorted.length) {
      const next = sorted[end + 1];
      if (next === undefined || compareScores(first.score, next.score, tieBreakers) !== 0) break;
      end += 1;
    }
    const groupStart = start + 1;
    const groupEnd = end + 1;
    for (const row of sorted.slice(start, end + 1)) {
      ranked.push({
        entryId: row.entryId,
        score: row.score,
        rank: groupStart,
        groupStart,
        groupEnd,
        groupSize: groupEnd - groupStart + 1,
      });
    }
    start = end + 1;
  }
  return ranked;
}
