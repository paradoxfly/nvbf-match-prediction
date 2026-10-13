// Points per match and per daily entry.

import { setLineError } from './closeness';
import { majorWinner, summarizeSetLine } from './format';
import type {
  CountedPrediction,
  EntryScore,
  MajorScore,
  MatchOutcome,
  MatchPoints,
  ScoringConfig,
} from './types';

/** 3 for the winner, +2 for the number of sets, +2 for the exact score; bonuses need the winner. */
export const DEFAULT_SCORING: ScoringConfig = {
  winner: 3,
  setCount: 2,
  exactScore: 2,
  bonusNeedsWinner: true,
};

/** Points for one match. A missing prediction (`null`) scores 0. */
export function scoreMatch(
  predicted: MajorScore | null,
  actual: MajorScore,
  cfg: ScoringConfig,
): MatchPoints {
  const actualWinner = majorWinner(actual);
  if (predicted === null) return { points: 0, correctWinner: false, exactScore: false };

  const correctWinner = majorWinner(predicted) === actualWinner;
  const sameSetCount =
    predicted.homeSets + predicted.awaySets === actual.homeSets + actual.awaySets;
  const exactScore =
    predicted.homeSets === actual.homeSets && predicted.awaySets === actual.awaySets;
  const bonusesCount = correctWinner || !cfg.bonusNeedsWinner;

  const points =
    (correctWinner ? cfg.winner : 0) +
    (bonusesCount && sameSetCount ? cfg.setCount : 0) +
    (bonusesCount && exactScore ? cfg.exactScore : 0);
  return { points, correctWinner, exactScore };
}

/** The most one match can be worth. */
export function maxPointsPerMatch(cfg: ScoringConfig): number {
  return cfg.winner + cfg.setCount + cfg.exactScore;
}

/**
 * Totals for one entry. Only final matches with a confirmed result are scored; void and pending
 * matches are ignored, as are predictions for them. A scored match without a prediction adds 0
 * points and counts as 0–0 in every set for closeness.
 */
export function scoreEntry(
  predictions: readonly CountedPrediction[],
  matches: readonly MatchOutcome[],
  cfg: ScoringConfig,
): EntryScore {
  const byMatch = new Map<string, CountedPrediction>();
  for (const prediction of predictions) {
    if (byMatch.has(prediction.matchId)) {
      throw new Error(`Two predictions for match ${prediction.matchId}; only one may count.`);
    }
    byMatch.set(prediction.matchId, prediction);
  }

  const score: EntryScore = {
    points: 0,
    closeness: 0,
    exactCount: 0,
    winnerCount: 0,
    scoredMatches: 0,
    countedPredictions: 0,
  };
  const seenMatches = new Set<string>();
  for (const match of matches) {
    if (seenMatches.has(match.matchId)) {
      throw new Error(`Match ${match.matchId} is listed twice.`);
    }
    seenMatches.add(match.matchId);
    if (match.status !== 'final' || match.result === null) continue;

    score.scoredMatches += 1;
    const actual = summarizeSetLine(match.result).major;
    const prediction = byMatch.get(match.matchId);
    if (prediction === undefined) {
      score.closeness += setLineError(null, match.result);
      continue;
    }

    score.countedPredictions += 1;
    const result = scoreMatch(summarizeSetLine(prediction.sets).major, actual, cfg);
    score.points += result.points;
    if (result.exactScore) score.exactCount += 1;
    if (result.correctWinner) score.winnerCount += 1;
    score.closeness += setLineError(prediction.sets, match.result);
  }
  return score;
}
