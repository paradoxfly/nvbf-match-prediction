import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesBetween,
  formatWatClock,
  formatWatDateTime,
  TIME_ZONE,
  TIME_ZONE_LABEL,
  watDate,
  watTime,
  watToUtc,
} from './time';

describe('constants', () => {
  it('uses Lagos time', () => {
    expect(TIME_ZONE).toBe('Africa/Lagos');
    expect(TIME_ZONE_LABEL).toBe('WAT');
  });
});

describe('watToUtc', () => {
  it.each([
    ['2025-10-18', '16:00', '2025-10-18T15:00:00.000Z'],
    ['2025-10-18', '00:30', '2025-10-17T23:30:00.000Z'],
    ['2025-10-19', '00:00', '2025-10-18T23:00:00.000Z'],
    ['2025-01-01', '00:59', '2024-12-31T23:59:00.000Z'],
    ['2024-02-29', '23:59', '2024-02-29T22:59:00.000Z'],
    ['2025-07-01', '12:00', '2025-07-01T11:00:00.000Z'], // no daylight saving in WAT
  ])('%s %s WAT → %s', (date, time, expected) => {
    expect(watToUtc(date, time).toISOString()).toBe(expected);
  });

  it.each([
    ['2025-2-01', '16:00'],
    ['2025-02-30', '16:00'],
    ['2025-13-01', '16:00'],
    ['2025-02-29', '16:00'],
    ['18/10/2025', '16:00'],
    ['0099-01-01', '16:00'],
    ['2025-10-18', '24:00'],
    ['2025-10-18', '9:00'],
    ['2025-10-18', '12:60'],
    ['2025-10-18', '4pm'],
    ['2025-10-18', ''],
  ])('throws on %o %o', (date, time) => {
    expect(() => watToUtc(date, time)).toThrow();
  });
});

describe('watDate / watTime', () => {
  it.each([
    ['2025-10-18T15:00:00Z', '2025-10-18', '16:00'],
    ['2025-10-18T22:59:59Z', '2025-10-18', '23:59'],
    ['2025-10-18T23:00:00Z', '2025-10-19', '00:00'],
    ['2025-10-18T23:30:00Z', '2025-10-19', '00:30'],
    ['2025-12-31T23:00:00Z', '2026-01-01', '00:00'],
  ])('%s is %s %s WAT', (iso, date, time) => {
    expect(watDate(new Date(iso))).toBe(date);
    expect(watTime(new Date(iso))).toBe(time);
  });

  it('throws on an invalid date', () => {
    expect(() => watDate(new Date('nope'))).toThrow();
    expect(() => watTime(new Date('nope'))).toThrow();
  });

  it('round-trips with watToUtc', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (dayMs, hour, minute) => {
          const date = new Date(dayMs).toISOString().slice(0, 10);
          const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          const instant = watToUtc(date, time);
          expect(watDate(instant)).toBe(date);
          expect(watTime(instant)).toBe(time);
        },
      ),
    );
  });
});

describe('formatWatDateTime', () => {
  it.each([
    ['2025-10-18T15:00:00Z', 'Sat 18 Oct, 4:00pm'],
    ['2025-10-19T08:05:00Z', 'Sun 19 Oct, 9:05am'],
    ['2025-12-31T23:30:00Z', 'Thu 1 Jan, 12:30am'],
    ['2025-09-06T22:59:00Z', 'Sat 6 Sep, 11:59pm'],
  ])('%s → %s', (iso, expected) => {
    expect(formatWatDateTime(new Date(iso))).toBe(expected);
  });

  it('agrees with watDate and formatWatClock', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) }), (ms) => {
        const instant = new Date(ms);
        const day = String(Number(watDate(instant).slice(8)));
        expect(formatWatDateTime(instant)).toContain(` ${day} `);
        expect(formatWatDateTime(instant).endsWith(`, ${formatWatClock(instant)}`)).toBe(true);
      }),
    );
  });

  it('throws on an invalid date', () => {
    expect(() => formatWatDateTime(new Date('nope'))).toThrow();
  });
});

describe('formatWatClock', () => {
  it.each([
    ['2025-10-18T12:56:00Z', '1:56pm'],
    ['2025-10-18T11:00:00Z', '12:00pm'],
    ['2025-10-18T23:05:00Z', '12:05am'],
    ['2025-10-18T07:30:00Z', '8:30am'],
    ['2025-10-18T22:59:00Z', '11:59pm'],
  ])('%s → %s', (iso, expected) => {
    expect(formatWatClock(new Date(iso))).toBe(expected);
  });

  it('agrees with the 24-hour watTime', () => {
    fc.assert(
      fc.property(fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) }), (ms) => {
        const instant = new Date(ms);
        const [hours, minutes] = watTime(instant).split(':').map(Number) as [number, number];
        const match = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(formatWatClock(instant));
        expect(match).not.toBeNull();
        const [, hour12, mins, half] = match!;
        expect((Number(hour12) % 12) + (half === 'pm' ? 12 : 0)).toBe(hours);
        expect(Number(mins)).toBe(minutes);
      }),
    );
  });
});

describe('addDays', () => {
  it.each([
    ['2025-10-18', 0, '2025-10-18'],
    ['2025-10-18', 1, '2025-10-19'],
    ['2025-10-18', 30, '2025-11-17'],
    ['2025-12-31', 1, '2026-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2025-03-01', -1, '2025-02-28'],
    ['2025-01-01', -1, '2024-12-31'],
  ])('%s + %i → %s', (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });

  it.each([
    ['2025-10-18', 1.5],
    ['2025-10-32', 1],
    ['2025-10-18', 1e12],
  ])('throws on %s + %s', (date, n) => {
    expect(() => addDays(date, n)).toThrow();
  });
});

describe('datesBetween', () => {
  it.each([
    ['2025-10-30', '2025-11-02', ['2025-10-30', '2025-10-31', '2025-11-01', '2025-11-02']],
    ['2025-10-18', '2025-10-18', ['2025-10-18']],
    ['2024-02-28', '2024-03-01', ['2024-02-28', '2024-02-29', '2024-03-01']],
    ['2025-10-19', '2025-10-18', []],
  ])('%s to %s', (start, end, expected) => {
    expect(datesBetween(start, end)).toEqual(expected);
  });

  it('throws on an invalid date', () => {
    expect(() => datesBetween('2025-10-18', 'tomorrow')).toThrow();
  });
});
