// League jackpot: predict the final league tables; the closest prediction wins.

import { compareIds } from './ranking';
import { compareTeamNames } from './standings';
import {
  CATEGORIES,
  type JackpotCandidate,
  type JackpotStanding,
  type StandingsOrders,
} from './types';

/**
 * Makes a predicted order comparable with the final table: drops teams that aren't in it
 * (withdrawn), keeps the first of any duplicates, then adds missing teams at the bottom by name.
 * The result always contains every team in `finalOrder` exactly once.
 */
export function normalizePrediction(
  predicted: readonly string[],
  finalOrder: readonly string[],
  teamNames: Readonly<Record<string, string>>,
): string[] {
  const inFinal = new Set(finalOrder);
  if (inFinal.size !== finalOrder.length) throw new Error('The final table lists a team twice.');
  const placed = new Set<string>();
  const order: string[] = [];
  for (const teamId of predicted) {
    if (!inFinal.has(teamId) || placed.has(teamId)) continue;
    placed.add(teamId);
    order.push(teamId);
  }
  const missing = finalOrder
    .filter((teamId) => !placed.has(teamId))
    .sort((a, b) => compareTeamNames(a, b, teamNames));
  return [...order, ...missing];
}

/**
 * Total places off, summed over every team in every category present in `final`.
 * A category missing from the prediction counts as an empty prediction. Perfect = 0.
 */
export function standingsDistance(
  predicted: StandingsOrders,
  final: StandingsOrders,
  teamNames: Readonly<Record<string, string>>,
): number {
  let distance = 0;
  for (const category of CATEGORIES) {
    const finalOrder = final[category];
    if (finalOrder === undefined) continue;
    const finalIndex = new Map(finalOrder.map((teamId, index) => [teamId, index]));
    const normalized = normalizePrediction(predicted[category] ?? [], finalOrder, teamNames);
    normalized.forEach((teamId, index) => {
      distance += Math.abs(index - (finalIndex.get(teamId) ?? index));
    });
  }
  return distance;
}

/** Eligible candidates by distance, then earlier `submittedAt`, then entryId. Position is 1-based. */
export function rankJackpot(
  candidates: readonly JackpotCandidate[],
  final: StandingsOrders,
  teamNames: Readonly<Record<string, string>>,
): JackpotStanding[] {
  const seen = new Set<string>();
  const scored: { entryId: string; distance: number; submittedAt: number }[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.entryId)) throw new Error(`Entry ${candidate.entryId} is listed twice.`);
    seen.add(candidate.entryId);
    if (!candidate.eligible) continue;
    const submittedAt = candidate.submittedAt.getTime();
    if (Number.isNaN(submittedAt)) {
      throw new RangeError(`Entry ${candidate.entryId} has an invalid submittedAt date.`);
    }
    scored.push({
      entryId: candidate.entryId,
      distance: standingsDistance(candidate.orders, final, teamNames),
      submittedAt,
    });
  }
  scored.sort(
    (a, b) =>
      a.distance - b.distance || a.submittedAt - b.submittedAt || compareIds(a.entryId, b.entryId),
  );
  return scored.map((entry, index) => ({
    entryId: entry.entryId,
    distance: entry.distance,
    position: index + 1,
  }));
}

/** The jackpot winner, or `null` when nobody is eligible. */
export function pickJackpotWinner(
  candidates: readonly JackpotCandidate[],
  final: StandingsOrders,
  teamNames: Readonly<Record<string, string>>,
): JackpotStanding | null {
  return rankJackpot(candidates, final, teamNames)[0] ?? null;
}
