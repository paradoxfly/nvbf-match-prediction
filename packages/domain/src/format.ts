// Volleyball match format: set targets, valid set scores and set lines.

import type {
  MajorScore,
  MatchFormat,
  SetLine,
  SetLineIssue,
  SetLineSummary,
  SetLineValidation,
  SetScore,
  Side,
} from './types';

/** Standard indoor volleyball: best of 5, sets to 25, deciding set to 15. */
export const DEFAULT_FORMAT: MatchFormat = { bestOf: 5, setTarget: 25, decidingSetTarget: 15 };

const DASH = '–';

/** Sets a team needs to win the match: 3 in a best of 5, 2 in a best of 3. */
export function setsToWin(format: MatchFormat): number {
  return Math.ceil(format.bestOf / 2);
}

/** Points needed to win the set at `setIndex` (0-based). Only the last possible set is the deciding set. */
export function targetForSet(setIndex: number, format: MatchFormat): number {
  return setIndex === format.bestOf - 1 ? format.decidingSetTarget : format.setTarget;
}

/** The winner's points in a finished set: the target, or 2 clear of the loser once past it. */
export function winnerPoints(loserPoints: number, target: number): number {
  return Math.max(target, loserPoints + 2);
}

function isPoints(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/** A finished set: whole points, no tie, and won exactly at the target or by 2 after it (25–23, 27–25). */
export function isValidSetScore(score: SetScore, target: number): boolean {
  const { home, away } = score;
  if (!isPoints(home) || !isPoints(away) || home === away) return false;
  return Math.max(home, away) === winnerPoints(Math.min(home, away), target);
}

/** The side that won more sets. Throws when the sets are level (not a finished match). */
export function majorWinner(major: MajorScore): Side {
  const { homeSets, awaySets } = major;
  if (!isPoints(homeSets) || !isPoints(awaySets)) {
    throw new RangeError(`Set counts must be whole numbers, got ${homeSets}–${awaySets}.`);
  }
  if (homeSets === awaySets) {
    throw new Error(`A ${homeSets}–${awaySets} score has no winner.`);
  }
  return homeSets > awaySets ? 'home' : 'away';
}

function setRuleMessage(setIndex: number, format: MatchFormat): string {
  const target = targetForSet(setIndex, format);
  const which = setIndex === format.bestOf - 1 ? 'the deciding set' : 'a set';
  const examples = `${target}${DASH}${Math.max(0, target - 2)} or ${target + 2}${DASH}${target}`;
  return `Set ${setIndex + 1}: ${which} ends at ${target} points with a 2-point lead, like ${examples}.`;
}

/** Checks a full match (or a prediction of one) set by set, with friendly messages for fans. */
export function validateSetLine(sets: SetLine, format: MatchFormat): SetLineValidation {
  if (sets.length === 0) {
    return {
      ok: false,
      issues: [{ code: 'NO_SETS', message: 'Add the score of each set, starting with set 1.' }],
    };
  }
  if (sets.length > format.bestOf) {
    return {
      ok: false,
      issues: [
        {
          code: 'TOO_MANY_SETS',
          message: `A match has at most ${format.bestOf} sets. Remove the extra sets.`,
        },
      ],
    };
  }

  const needed = setsToWin(format);
  const issues: SetLineIssue[] = [];
  let homeWins = 0;
  let awayWins = 0;
  let decidedAfter: number | null = null;

  for (const [setIndex, set] of sets.entries()) {
    const label = `Set ${setIndex + 1}`;
    if (!isPoints(set.home) || !isPoints(set.away)) {
      issues.push({
        code: 'INVALID_SET_SCORE',
        setIndex,
        message: `${label}: points must be whole numbers (0 or more).`,
      });
    } else if (set.home === set.away) {
      issues.push({
        code: 'TIED_SET',
        setIndex,
        message: `${label}: a set can't end in a tie. One team must win it by 2 points.`,
      });
    } else if (!isValidSetScore(set, targetForSet(setIndex, format))) {
      issues.push({
        code: 'INVALID_SET_SCORE',
        setIndex,
        message: setRuleMessage(setIndex, format),
      });
    }

    if (decidedAfter !== null) {
      issues.push({
        code: 'SET_AFTER_MATCH_DECIDED',
        setIndex,
        message: `${label}: the match was already won after set ${decidedAfter + 1}, so remove this set.`,
      });
      continue;
    }
    if (set.home > set.away) homeWins += 1;
    else if (set.away > set.home) awayWins += 1;
    if (homeWins === needed || awayWins === needed) decidedAfter = setIndex;
  }

  if (decidedAfter === null) {
    issues.push({
      code: 'MATCH_NOT_DECIDED',
      message: `A team must win ${needed} sets to win the match. Add the missing sets.`,
    });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, summary: summarizeSetLine(sets) };
}

/** Sets won and total points per side. Throws when neither side won more sets. */
export function summarizeSetLine(sets: SetLine): SetLineSummary {
  let homeSets = 0;
  let awaySets = 0;
  let homePoints = 0;
  let awayPoints = 0;
  for (const set of sets) {
    homePoints += set.home;
    awayPoints += set.away;
    if (set.home > set.away) homeSets += 1;
    else if (set.away > set.home) awaySets += 1;
  }
  if (homeSets === awaySets) {
    throw new Error(`These sets have no winner (${homeSets}–${awaySets} in sets).`);
  }
  return {
    major: { homeSets, awaySets },
    winner: homeSets > awaySets ? 'home' : 'away',
    totals: { home: homePoints, away: awayPoints },
  };
}

/** Every possible final set score: home wins (fewest sets first), then away wins. Best of 5: 3–0, 3–1, 3–2, 0–3, 1–3, 2–3. */
export function majorOutcomes(format: MatchFormat): MajorScore[] {
  const needed = setsToWin(format);
  const outcomes: MajorScore[] = [];
  for (let lost = 0; lost < needed; lost += 1) outcomes.push({ homeSets: needed, awaySets: lost });
  for (let lost = 0; lost < needed; lost += 1) outcomes.push({ homeSets: lost, awaySets: needed });
  return outcomes;
}

/** One side has exactly the sets needed to win; the other has fewer. */
export function isValidMajor(major: MajorScore, format: MatchFormat): boolean {
  const needed = setsToWin(format);
  const { homeSets, awaySets } = major;
  if (!isPoints(homeSets) || !isPoints(awaySets)) return false;
  return (homeSets === needed && awaySets < needed) || (awaySets === needed && homeSets < needed);
}

/**
 * A valid order of set winners for a final set score, with the loser's sets at indexes 1, 3, …
 * Home 3–1 → home, away, home, home. Home 3–2 → home, away, home, away, home.
 */
export function defaultSetWinners(major: MajorScore): Side[] {
  const winner = majorWinner(major);
  const loser: Side = winner === 'home' ? 'away' : 'home';
  const lost = Math.min(major.homeSets, major.awaySets);
  const total = major.homeSets + major.awaySets;
  const order: Side[] = [];
  for (let index = 0; index < total; index += 1) {
    const loserSet = index % 2 === 1 && (index - 1) / 2 < lost;
    order.push(loserSet ? loser : winner);
  }
  return order;
}

/** True when the set winners add up to `major` and the match is only decided by the last set. */
export function isValidSetWinners(
  winners: readonly Side[],
  major: MajorScore,
  format: MatchFormat,
): boolean {
  if (!isValidMajor(major, format)) return false;
  if (winners.length !== major.homeSets + major.awaySets) return false;
  const needed = setsToWin(format);
  let home = 0;
  let away = 0;
  for (let index = 0; index < winners.length; index += 1) {
    const side = winners[index];
    if (side === 'home') home += 1;
    else if (side === 'away') away += 1;
    else return false;
    const decided = home === needed || away === needed;
    if (decided && index !== winners.length - 1) return false;
  }
  return home === major.homeSets && away === major.awaySets;
}

/**
 * Builds the set line from who won each set and the loser's points: each winner gets
 * `winnerPoints(loser, target)`. Lets the fan type only the losing side's points.
 */
export function buildSetLine(
  winners: readonly Side[],
  loserPoints: readonly number[],
  format: MatchFormat,
): SetLine {
  if (winners.length !== loserPoints.length) {
    throw new Error(
      `Got ${winners.length} set winners but ${loserPoints.length} loser scores; they must match.`,
    );
  }
  return winners.map((side, index) => {
    const loser = loserPoints[index] ?? Number.NaN;
    const winner = winnerPoints(loser, targetForSet(index, format));
    return side === 'home' ? { home: winner, away: loser } : { home: loser, away: winner };
  });
}
