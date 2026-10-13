// When predictions lock, and which predictions and payments count. Locks never reopen.

import type { DayTiming, MatchTiming } from './types';

const MINUTE_MS = 60_000;

/** Milliseconds of a date, throwing on an invalid date so a bad value can never unlock a match. */
function timeOf(date: Date, label: string): number {
  const ms = date.getTime();
  if (Number.isNaN(ms)) throw new RangeError(`${label} is not a valid date.`);
  return ms;
}

/**
 * When predictions for a match lock: the earliest of its scheduled start minus the lead time,
 * its actual (early) start, an earlier lock kept after rescheduling, and the day closing.
 */
export function lockAt(match: MatchTiming, day: DayTiming): Date {
  if (!Number.isSafeInteger(day.lockLeadMin) || day.lockLeadMin < 0) {
    throw new RangeError(`lockLeadMin must be whole minutes (0 or more), got ${day.lockLeadMin}.`);
  }
  let lock = timeOf(match.scheduledAt, 'scheduledAt') - day.lockLeadMin * MINUTE_MS;
  const others: [Date | null, string][] = [
    [match.actualStartAt, 'actualStartAt'],
    [match.lockedAt, 'lockedAt'],
    [day.closedAt, 'closedAt'],
    [day.submissionsCloseAt, 'submissionsCloseAt'],
  ];
  for (const [date, label] of others) {
    if (date !== null) lock = Math.min(lock, timeOf(date, label));
  }
  return new Date(lock);
}

/** Locked unless the day is open, the match is still scheduled and its lock time is in the future. */
export function isMatchLocked(match: MatchTiming, day: DayTiming, now: Date): boolean {
  if (day.status !== 'open' || match.status !== 'scheduled') return true;
  return timeOf(now, 'now') >= lockAt(match, day).getTime();
}

/** Whether a prediction for this match may be created or changed right now. */
export function canSavePrediction(match: MatchTiming, day: DayTiming, now: Date): boolean {
  return !isMatchLocked(match, day, now);
}

/**
 * The last moment an entry can still count for something: the latest lock among non-void
 * matches, capped by the day closing. `null` when nothing sets a cutoff.
 */
export function entryCutoff(day: DayTiming, matches: readonly MatchTiming[]): Date | null {
  let latestLock: number | null = null;
  for (const match of matches) {
    if (match.status === 'void') continue;
    const lock = lockAt(match, day).getTime();
    latestLock = latestLock === null ? lock : Math.max(latestLock, lock);
  }
  const candidates: number[] = [];
  if (latestLock !== null) candidates.push(latestLock);
  if (day.closedAt !== null) candidates.push(timeOf(day.closedAt, 'closedAt'));
  if (day.submissionsCloseAt !== null) {
    candidates.push(timeOf(day.submissionsCloseAt, 'submissionsCloseAt'));
  }
  return candidates.length === 0 ? null : new Date(Math.min(...candidates));
}

/**
 * Fairness rule: a prediction only counts for a match if the entry money reached us before that
 * match locked.
 */
export function paymentCountsForMatch(
  creditedAt: Date | null,
  match: MatchTiming,
  day: DayTiming,
): boolean {
  if (creditedAt === null) return false;
  return timeOf(creditedAt, 'creditedAt') < lockAt(match, day).getTime();
}

/** The latest revision saved before the lock (a later array item wins an exact tie), or `null`. */
export function pickCountedRevision<T extends { savedAt: Date }>(
  revisions: readonly T[],
  lock: Date,
): T | null {
  const limit = timeOf(lock, 'lock');
  let counted: T | null = null;
  let countedAt = Number.NEGATIVE_INFINITY;
  for (const revision of revisions) {
    const savedAt = timeOf(revision.savedAt, 'savedAt');
    if (savedAt < limit && savedAt >= countedAt) {
      counted = revision;
      countedAt = savedAt;
    }
  }
  return counted;
}
