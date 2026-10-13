// How close a predicted set line was to the real one. Used to break ties (lower is better).

import type { SetLine, SetScore } from './types';

const NO_SET: SetScore = { home: 0, away: 0 };

/**
 * Sum, set by set, of |predicted − actual| points for each side. A set missing on either side
 * counts as 0–0, so a skipped match (`null`) costs every point that was played.
 */
export function setLineError(predicted: SetLine | null, actual: SetLine): number {
  const guess = predicted ?? [];
  const length = Math.max(guess.length, actual.length);
  let error = 0;
  for (let index = 0; index < length; index += 1) {
    const p = guess[index] ?? NO_SET;
    const a = actual[index] ?? NO_SET;
    error += Math.abs(p.home - a.home) + Math.abs(p.away - a.away);
  }
  return error;
}
