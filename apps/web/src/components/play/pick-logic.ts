// Pure helpers for editing one match pick. The rules themselves live in @predict/domain.

import {
  buildSetLine,
  defaultSetWinners,
  isValidSetWinners,
  majorWinner,
  targetForSet,
  validateSetLine,
  winnerPoints,
  type MajorScore,
  type MatchFormat,
  type SetLine,
  type Side,
} from '@predict/domain';

export interface PickDraft {
  homeSets: number;
  awaySets: number;
  /** Who wins each set, in order. */
  winners: Side[];
  /** The losing side's points in each set, as typed (may be empty while typing). */
  losers: string[];
  /** When the player last changed it, on the server's clock (ms). */
  at: number;
}

export type DraftCheck = { ok: true; sets: SetLine } | { ok: false; issues: string[] };

export interface TeamNames {
  home: string;
  away: string;
}

const DASH = '–';

export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

export const isDecidingSet = (index: number, format: MatchFormat) => index === format.bestOf - 1;

/** A sensible starting score for the losing side: 20 in a set to 25, 12 in a deciding set to 15. */
export function defaultLoserPoints(index: number, format: MatchFormat): number {
  return isDecidingSet(index, format)
    ? Math.max(0, format.decidingSetTarget - 3)
    : Math.max(0, format.setTarget - 5);
}

/** The set score from the winner's point of view, e.g. "3–1". */
export const majorText = (major: MajorScore) =>
  `${Math.max(major.homeSets, major.awaySets)}${DASH}${Math.min(major.homeSets, major.awaySets)}`;

/** "KAN 3–1": the winner's short name and the set score. */
export function majorLabel(major: MajorScore, names: TeamNames): string {
  return `${names[majorWinner(major)]} ${majorText(major)}`;
}

export const sameMajor = (a: MajorScore, b: MajorScore) =>
  a.homeSets === b.homeSets && a.awaySets === b.awaySets;

/** A fresh pick for a set score, keeping any points already typed for the sets that remain. */
export function draftForMajor(
  major: MajorScore,
  format: MatchFormat,
  previous: PickDraft | null,
  at: number,
): PickDraft {
  const winners = defaultSetWinners(major);
  const losers = winners.map(
    (_, index) => previous?.losers[index] ?? String(defaultLoserPoints(index, format)),
  );
  return { homeSets: major.homeSets, awaySets: major.awaySets, winners, losers, at };
}

/** The editable form of a saved prediction. */
export function draftFromSets(
  sets: readonly { home: number; away: number }[],
  at: number,
): PickDraft {
  const winners: Side[] = sets.map((set) => (set.home > set.away ? 'home' : 'away'));
  return {
    homeSets: winners.filter((side) => side === 'home').length,
    awaySets: winners.filter((side) => side === 'away').length,
    winners,
    losers: sets.map((set) => String(Math.min(set.home, set.away))),
    at,
  };
}

/**
 * Gives set `index` to `side` without changing the set score picked: another set (the nearest
 * later one, else the nearest earlier one) goes the other way. The last set always belongs to
 * the match winner. Returns null when the move is impossible (e.g. a 3–0 has no set to swap).
 */
export function moveSetWinner(winners: readonly Side[], index: number, side: Side): Side[] | null {
  if (winners[index] === side) return [...winners];
  const last = winners.length - 1;
  if (index < 0 || index >= last) return null;
  const candidates = winners
    .map((winner, position) => ({ winner, position }))
    .filter(({ winner, position }) => winner === side && position !== index && position < last)
    .map(({ position }) => position);
  if (candidates.length === 0) return null;
  const later = candidates.filter((position) => position > index);
  const swap = later.length > 0 ? Math.min(...later) : Math.max(...candidates);
  const next = [...winners];
  next[index] = side;
  next[swap] = otherSide(side);
  return next;
}

/** The loser's points as a number, or null while the box is empty or not a whole number. */
export function parsePoints(value: string | undefined): number | null {
  const text = (value ?? '').trim();
  return /^\d{1,3}$/.test(text) ? Number(text) : null;
}

/** The winner's points shown next to the loser's box (the target until a number is typed). */
export function shownWinnerPoints(loser: string | undefined, index: number, format: MatchFormat) {
  const points = parsePoints(loser);
  const target = targetForSet(index, format);
  return points === null ? target : winnerPoints(points, target);
}

function winnersMessage(major: MajorScore, names: TeamNames): string {
  const winner = majorWinner(major);
  const won = Math.max(major.homeSets, major.awaySets);
  const lost = Math.min(major.homeSets, major.awaySets);
  const loserPart = lost > 0 ? ` and ${names[otherSide(winner)]} ${lost}` : '';
  return (
    `For ${majorLabel(major, names)}, ${names[winner]} must win ${won} sets${loserPart}, ` +
    'and the last set must go to the winner.'
  );
}

/** Checks a pick with the same rules the server uses, with messages written for fans. */
export function checkDraft(draft: PickDraft, format: MatchFormat, names: TeamNames): DraftCheck {
  const major = { homeSets: draft.homeSets, awaySets: draft.awaySets };
  if (draft.winners.length !== draft.losers.length) {
    return { ok: false, issues: ['Choose the result again to reset the sets.'] };
  }
  if (!isValidSetWinners(draft.winners, major, format)) {
    return { ok: false, issues: [winnersMessage(major, names)] };
  }

  const issues: string[] = [];
  const losers: number[] = [];
  draft.losers.forEach((raw, index) => {
    const points = parsePoints(raw);
    if (points === null) {
      issues.push(
        raw.trim() === ''
          ? `Set ${index + 1}: type the losing team's points.`
          : `Set ${index + 1}: use a whole number of points.`,
      );
    } else {
      losers.push(points);
    }
  });
  if (issues.length > 0) return { ok: false, issues };

  const sets = buildSetLine(draft.winners, losers, format);
  const result = validateSetLine(sets, format);
  if (!result.ok) return { ok: false, issues: result.issues.map((issue) => issue.message) };
  return { ok: true, sets };
}

export function sameSets(
  a: readonly { home: number; away: number }[],
  b: readonly { home: number; away: number }[],
): boolean {
  return (
    a.length === b.length &&
    a.every((set, index) => set.home === b[index]?.home && set.away === b[index]?.away)
  );
}
