// League tables built from match results.

import { compareIds } from './ranking';
import type { StandingsPointsSystem, StandingsRow, TeamResult } from './types';

/** FIVB table points: 3 for a 3–0 or 3–1 win, 2 for a 3–2 win, 1 for a 2–3 loss (best of 3 too). */
export const FIVB_POINTS: StandingsPointsSystem = {
  '3-0': 3,
  '3-1': 3,
  '3-2': 2,
  '2-3': 1,
  '1-3': 0,
  '0-3': 0,
  '2-0': 3,
  '2-1': 2,
  '1-2': 1,
  '0-2': 0,
};

function tablePoints(system: StandingsPointsSystem, won: number, lost: number): number {
  const key = `${won}-${lost}`;
  return Object.hasOwn(system, key) ? (system[key] ?? 0) : 0;
}

function addResult(row: StandingsRow, won: number, lost: number, system: StandingsPointsSystem) {
  row.played += 1;
  row.setsWon += won;
  row.setsLost += lost;
  if (won > lost) row.won += 1;
  else if (lost > won) row.lost += 1;
  row.points += tablePoints(system, won, lost);
}

/** One row per team, in `teamIds` order. Results involving a team not in `teamIds` are ignored. */
export function standingsFromResults(
  teamIds: readonly string[],
  results: readonly TeamResult[],
  system: StandingsPointsSystem,
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const teamId of teamIds) {
    if (rows.has(teamId)) throw new Error(`Team ${teamId} is listed twice.`);
    rows.set(teamId, { teamId, played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, points: 0 });
  }
  for (const result of results) {
    const home = rows.get(result.homeTeamId);
    const away = rows.get(result.awayTeamId);
    if (home === undefined || away === undefined || home === away) continue;
    for (const sets of [result.homeSets, result.awaySets]) {
      if (!Number.isSafeInteger(sets) || sets < 0) {
        throw new RangeError(`Set counts must be whole numbers (0 or more), got ${sets}.`);
      }
    }
    addResult(home, result.homeSets, result.awaySets, system);
    addResult(away, result.awaySets, result.homeSets, system);
  }
  return [...rows.values()];
}

/** A team's display name, falling back to its id. */
function teamName(teamNames: Readonly<Record<string, string>>, teamId: string): string {
  return Object.hasOwn(teamNames, teamId) ? (teamNames[teamId] ?? teamId) : teamId;
}

/** Alphabetical by team name (English collation), then by id. */
export function compareTeamNames(
  a: string,
  b: string,
  teamNames: Readonly<Record<string, string>>,
): number {
  return teamName(teamNames, a).localeCompare(teamName(teamNames, b), 'en') || compareIds(a, b);
}

/** Positive when `a` has the better sets-won/sets-lost ratio. x/0 with x > 0 is infinite; 0/0 is 0. */
function compareSetRatio(a: StandingsRow, b: StandingsRow): number {
  const aInfinite = a.setsLost === 0 && a.setsWon > 0;
  const bInfinite = b.setsLost === 0 && b.setsWon > 0;
  if (aInfinite || bInfinite) {
    if (aInfinite === bInfinite) return 0;
    return aInfinite ? 1 : -1;
  }
  // Cross-multiply instead of dividing so equal ratios compare exactly.
  const aLost = a.setsLost === 0 ? 1 : a.setsLost;
  const bLost = b.setsLost === 0 ? 1 : b.setsLost;
  return a.setsWon * bLost - b.setsWon * aLost;
}

/** Team ids by points, then set ratio, then sets won, then name, then id. */
export function defaultStandingsOrder(
  rows: readonly StandingsRow[],
  teamNames: Readonly<Record<string, string>>,
): string[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.points - a.points ||
        compareSetRatio(b, a) ||
        b.setsWon - a.setsWon ||
        compareTeamNames(a.teamId, b.teamId, teamNames),
    )
    .map((row) => row.teamId);
}
