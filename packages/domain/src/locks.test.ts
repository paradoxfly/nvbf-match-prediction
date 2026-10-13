import { describe, expect, it } from 'vitest';
import {
  canSavePrediction,
  entryCutoff,
  isMatchLocked,
  lockAt,
  paymentCountsForMatch,
  pickCountedRevision,
} from './locks';
import type { DayTiming, MatchTiming } from './types';

/** A UTC instant on 18 Oct 2025 from 'HH:MM' (or 'HH:MM:SS.mmm'). WAT is one hour ahead. */
function at(time: string): Date {
  return new Date(`2025-10-18T${time}Z`);
}

const OPEN_DAY: DayTiming = {
  status: 'open',
  closedAt: null,
  submissionsCloseAt: null,
  lockLeadMin: 0,
};

/** Kicks off at 16:00 WAT (15:00 UTC). */
const MATCH: MatchTiming = {
  status: 'scheduled',
  scheduledAt: at('15:00'),
  actualStartAt: null,
  lockedAt: null,
};

describe('lockAt', () => {
  it.each<{ name: string; match: MatchTiming; day: DayTiming; expected: string }>([
    { name: 'the scheduled start', match: MATCH, day: OPEN_DAY, expected: '15:00' },
    {
      name: 'the lead time before the start',
      match: MATCH,
      day: { ...OPEN_DAY, lockLeadMin: 10 },
      expected: '14:50',
    },
    {
      name: 'an early actual start',
      match: { ...MATCH, actualStartAt: at('14:40') },
      day: OPEN_DAY,
      expected: '14:40',
    },
    {
      name: 'the scheduled start when the actual start is later',
      match: { ...MATCH, actualStartAt: at('15:20') },
      day: OPEN_DAY,
      expected: '15:00',
    },
    {
      name: 'the old lock after a match moves later (locks never reopen)',
      match: { ...MATCH, scheduledAt: at('18:00'), lockedAt: at('15:00') },
      day: OPEN_DAY,
      expected: '15:00',
    },
    {
      name: 'the day closing early',
      match: MATCH,
      day: { ...OPEN_DAY, closedAt: at('12:00') },
      expected: '12:00',
    },
    {
      name: 'the submissions deadline',
      match: MATCH,
      day: { ...OPEN_DAY, submissionsCloseAt: at('13:30'), closedAt: at('14:00') },
      expected: '13:30',
    },
    {
      name: 'the scheduled start when the day closes later',
      match: MATCH,
      day: { ...OPEN_DAY, closedAt: at('22:00'), submissionsCloseAt: at('21:00') },
      expected: '15:00',
    },
  ])('locks at $name', ({ match, day, expected }) => {
    expect(lockAt(match, day)).toEqual(at(expected));
  });

  it.each<{ name: string; match: MatchTiming; day: DayTiming }>([
    { name: 'a negative lead time', match: MATCH, day: { ...OPEN_DAY, lockLeadMin: -5 } },
    { name: 'a fractional lead time', match: MATCH, day: { ...OPEN_DAY, lockLeadMin: 0.5 } },
    { name: 'an invalid start', match: { ...MATCH, scheduledAt: new Date('nope') }, day: OPEN_DAY },
    { name: 'an invalid close', match: MATCH, day: { ...OPEN_DAY, closedAt: new Date('nope') } },
  ])('throws on $name', ({ match, day }) => {
    expect(() => lockAt(match, day)).toThrow();
  });
});

describe('isMatchLocked / canSavePrediction', () => {
  it.each<{ name: string; match: MatchTiming; day: DayTiming; now: string; locked: boolean }>([
    { name: 'well before the start', match: MATCH, day: OPEN_DAY, now: '09:00', locked: false },
    {
      name: '1 ms before the lock',
      match: MATCH,
      day: OPEN_DAY,
      now: '14:59:59.999',
      locked: false,
    },
    { name: 'exactly at the lock', match: MATCH, day: OPEN_DAY, now: '15:00', locked: true },
    { name: 'after the start', match: MATCH, day: OPEN_DAY, now: '16:00', locked: true },
    {
      name: 'inside the lead time',
      match: MATCH,
      day: { ...OPEN_DAY, lockLeadMin: 10 },
      now: '14:55',
      locked: true,
    },
    {
      name: 'after an early start',
      match: { ...MATCH, actualStartAt: at('14:30') },
      day: OPEN_DAY,
      now: '14:45',
      locked: true,
    },
    {
      name: 'after a rescheduled match’s original lock',
      match: { ...MATCH, scheduledAt: at('20:00'), lockedAt: at('15:00') },
      day: OPEN_DAY,
      now: '16:00',
      locked: true,
    },
    {
      name: 'a day not open yet',
      match: MATCH,
      day: { ...OPEN_DAY, status: 'published' },
      now: '09:00',
      locked: true,
    },
    {
      name: 'a closed day',
      match: MATCH,
      day: { ...OPEN_DAY, status: 'closed' },
      now: '09:00',
      locked: true,
    },
    {
      name: 'a cancelled day',
      match: MATCH,
      day: { ...OPEN_DAY, status: 'cancelled' },
      now: '09:00',
      locked: true,
    },
    {
      name: 'a void match',
      match: { ...MATCH, status: 'void' },
      day: OPEN_DAY,
      now: '09:00',
      locked: true,
    },
    {
      name: 'a finished match',
      match: { ...MATCH, status: 'final' },
      day: OPEN_DAY,
      now: '09:00',
      locked: true,
    },
  ])('$name → locked: $locked', ({ match, day, now, locked }) => {
    expect(isMatchLocked(match, day, at(now))).toBe(locked);
    expect(canSavePrediction(match, day, at(now))).toBe(!locked);
  });

  it('throws on an invalid now', () => {
    expect(() => isMatchLocked(MATCH, OPEN_DAY, new Date('nope'))).toThrow();
  });
});

describe('entryCutoff', () => {
  const early: MatchTiming = { ...MATCH, scheduledAt: at('13:00') };
  const late: MatchTiming = { ...MATCH, scheduledAt: at('17:00') };
  const voidLater: MatchTiming = { ...MATCH, status: 'void', scheduledAt: at('19:00') };

  it.each<{ name: string; day: DayTiming; matches: MatchTiming[]; expected: string | null }>([
    {
      name: 'the last match lock',
      day: OPEN_DAY,
      matches: [early, late, voidLater],
      expected: '17:00',
    },
    {
      name: 'the last lock with lead time',
      day: { ...OPEN_DAY, lockLeadMin: 15 },
      matches: [late, early],
      expected: '16:45',
    },
    {
      name: 'the day closing first',
      day: { ...OPEN_DAY, closedAt: at('14:00') },
      matches: [early, late],
      expected: '14:00',
    },
    {
      name: 'the submissions deadline with no matches',
      day: { ...OPEN_DAY, submissionsCloseAt: at('18:00') },
      matches: [],
      expected: '18:00',
    },
    { name: 'nothing when only void matches', day: OPEN_DAY, matches: [voidLater], expected: null },
    { name: 'nothing at all', day: OPEN_DAY, matches: [], expected: null },
  ])('is $name', ({ day, matches, expected }) => {
    expect(entryCutoff(day, matches)).toEqual(expected === null ? null : at(expected));
  });
});

describe('paymentCountsForMatch', () => {
  it.each<{
    name: string;
    creditedAt: string | null;
    match: MatchTiming;
    day: DayTiming;
    counts: boolean;
  }>([
    {
      name: 'money in before the lock',
      creditedAt: '10:00',
      match: MATCH,
      day: OPEN_DAY,
      counts: true,
    },
    {
      name: 'money in 1 ms before the lock',
      creditedAt: '14:59:59.999',
      match: MATCH,
      day: OPEN_DAY,
      counts: true,
    },
    {
      name: 'money in exactly at the lock',
      creditedAt: '15:00',
      match: MATCH,
      day: OPEN_DAY,
      counts: false,
    },
    {
      name: 'money in after the start',
      creditedAt: '15:30',
      match: MATCH,
      day: OPEN_DAY,
      counts: false,
    },
    { name: 'no money yet', creditedAt: null, match: MATCH, day: OPEN_DAY, counts: false },
    {
      name: 'money in inside the lead time',
      creditedAt: '14:55',
      match: MATCH,
      day: { ...OPEN_DAY, lockLeadMin: 10 },
      counts: false,
    },
    {
      name: 'money in after an early start',
      creditedAt: '14:45',
      match: { ...MATCH, actualStartAt: at('14:30') },
      day: OPEN_DAY,
      counts: false,
    },
  ])('$name → $counts', ({ creditedAt, match, day, counts }) => {
    expect(paymentCountsForMatch(creditedAt === null ? null : at(creditedAt), match, day)).toBe(
      counts,
    );
  });
});

describe('pickCountedRevision', () => {
  const r10 = { id: 'r10', savedAt: at('10:00') };
  const r12 = { id: 'r12', savedAt: at('12:00') };
  const r14 = { id: 'r14', savedAt: at('14:00') };
  const r12b = { id: 'r12b', savedAt: at('12:00') };

  it.each<{
    name: string;
    revisions: { id: string; savedAt: Date }[];
    lock: string;
    expected: string | null;
  }>([
    {
      name: 'the latest before the lock',
      revisions: [r10, r12, r14],
      lock: '13:00',
      expected: 'r12',
    },
    { name: 'the latest in any order', revisions: [r14, r10, r12], lock: '13:00', expected: 'r12' },
    { name: 'none saved before the lock', revisions: [r12, r14], lock: '11:00', expected: null },
    {
      name: 'not one saved exactly at the lock',
      revisions: [r10, r12],
      lock: '12:00',
      expected: 'r10',
    },
    {
      name: 'the later of two saved at the same time',
      revisions: [r12, r12b],
      lock: '13:00',
      expected: 'r12b',
    },
    { name: 'nothing from nothing', revisions: [], lock: '13:00', expected: null },
  ])('picks $name', ({ revisions, lock, expected }) => {
    expect(pickCountedRevision(revisions, at(lock))?.id ?? null).toBe(expected);
  });
});
