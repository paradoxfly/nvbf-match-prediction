import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { setLineError } from './closeness';
import type { SetLine } from './types';

function s(...sets: string[]): SetLine {
  return sets.map((set) => {
    const [home, away] = set.split('-').map(Number);
    return { home: home ?? Number.NaN, away: away ?? Number.NaN };
  });
}

const ACTUAL_3_1 = s('25-20', '23-25', '25-22', '25-18');

describe('setLineError', () => {
  it.each<{ name: string; predicted: SetLine | null; actual: SetLine; expected: number }>([
    { name: 'identical lines', predicted: ACTUAL_3_1, actual: ACTUAL_3_1, expected: 0 },
    {
      name: 'a few points off',
      predicted: s('25-22', '23-25', '25-20', '25-18'),
      actual: ACTUAL_3_1,
      expected: 2 + 0 + 2 + 0,
    },
    {
      name: 'predicted 3 sets, actual 4 (missing set counts as 0–0)',
      predicted: s('25-20', '25-20', '25-20'),
      actual: ACTUAL_3_1,
      expected: 0 + (2 + 5) + (0 + 2) + (25 + 18),
    },
    {
      name: 'predicted 5 sets, actual 3',
      predicted: s('25-20', '20-25', '25-20', '20-25', '15-10'),
      actual: s('25-20', '25-20', '25-20'),
      expected: 0 + (5 + 5) + 0 + (20 + 25) + (15 + 10),
    },
    {
      name: 'no prediction costs every point played',
      predicted: null,
      actual: ACTUAL_3_1,
      expected: 98 + 85,
    },
    { name: 'nothing against nothing', predicted: null, actual: [], expected: 0 },
  ])('$name → $expected', ({ predicted, actual, expected }) => {
    expect(setLineError(predicted, actual)).toBe(expected);
  });

  const setLine = fc.array(
    fc.record({ home: fc.integer({ min: 0, max: 40 }), away: fc.integer({ min: 0, max: 40 }) }),
    { maxLength: 5 },
  );

  it('is symmetric and zero for identical lines', () => {
    fc.assert(
      fc.property(setLine, setLine, (a, b) => {
        expect(setLineError(a, b)).toBe(setLineError(b, a));
        expect(setLineError(a, a)).toBe(0);
      }),
    );
  });

  it('obeys the triangle inequality', () => {
    fc.assert(
      fc.property(setLine, setLine, setLine, (a, b, c) => {
        expect(setLineError(a, c)).toBeLessThanOrEqual(setLineError(a, b) + setLineError(b, c));
      }),
    );
  });
});
