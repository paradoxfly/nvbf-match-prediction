import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildSetLine,
  DEFAULT_FORMAT,
  defaultSetWinners,
  isValidMajor,
  isValidSetScore,
  isValidSetWinners,
  majorOutcomes,
  majorWinner,
  setsToWin,
  summarizeSetLine,
  targetForSet,
  validateSetLine,
  winnerPoints,
} from './format';
import type { MajorScore, MatchFormat, SetLine, SetLineIssueCode, Side } from './types';

const BO3: MatchFormat = { bestOf: 3, setTarget: 25, decidingSetTarget: 15 };

/** Shorthand: s('25-23', '23-25') → [{ home: 25, away: 23 }, { home: 23, away: 25 }]. */
function s(...sets: string[]): SetLine {
  return sets.map((set) => {
    const [home, away] = set.split('-').map(Number);
    return { home: home ?? Number.NaN, away: away ?? Number.NaN };
  });
}

const H: Side = 'home';
const A: Side = 'away';

describe('setsToWin', () => {
  it.each([
    { format: DEFAULT_FORMAT, expected: 3 },
    { format: BO3, expected: 2 },
  ])('best of $format.bestOf needs $expected sets', ({ format, expected }) => {
    expect(setsToWin(format)).toBe(expected);
  });
});

describe('targetForSet', () => {
  it.each([
    { setIndex: 0, format: DEFAULT_FORMAT, expected: 25 },
    { setIndex: 3, format: DEFAULT_FORMAT, expected: 25 },
    { setIndex: 4, format: DEFAULT_FORMAT, expected: 15 },
    { setIndex: 1, format: BO3, expected: 25 },
    { setIndex: 2, format: BO3, expected: 15 },
  ])('set index $setIndex of best of $format.bestOf goes to $expected', (row) => {
    expect(targetForSet(row.setIndex, row.format)).toBe(row.expected);
  });
});

describe('winnerPoints', () => {
  it.each([
    [0, 25, 25],
    [23, 25, 25],
    [24, 25, 26],
    [28, 25, 30],
    [13, 15, 15],
    [14, 15, 16],
  ])('loser %i with target %i → winner %i', (loser, target, expected) => {
    expect(winnerPoints(loser, target)).toBe(expected);
  });
});

describe('isValidSetScore', () => {
  it.each([
    { home: 25, away: 23, target: 25, valid: true },
    { home: 25, away: 24, target: 25, valid: false },
    { home: 26, away: 24, target: 25, valid: true },
    { home: 27, away: 25, target: 25, valid: true },
    { home: 24, away: 22, target: 25, valid: false },
    { home: 30, away: 28, target: 25, valid: true },
    { home: 15, away: 13, target: 15, valid: true },
    { home: 25, away: 0, target: 25, valid: true },
    { home: 23, away: 25, target: 25, valid: true },
    { home: 25, away: 25, target: 25, valid: false },
    { home: 26, away: 23, target: 25, valid: false },
    { home: 25, away: 13, target: 15, valid: false },
    { home: 15, away: 13, target: 25, valid: false },
    { home: -2, away: 25, target: 25, valid: false },
    { home: 25.5, away: 23, target: 25, valid: false },
    { home: Number.NaN, away: 23, target: 25, valid: false },
  ])('$home–$away to $target → $valid', ({ home, away, target, valid }) => {
    expect(isValidSetScore({ home, away }, target)).toBe(valid);
  });
});

describe('majorWinner', () => {
  it.each([
    { major: { homeSets: 3, awaySets: 1 }, expected: 'home' },
    { major: { homeSets: 2, awaySets: 3 }, expected: 'away' },
  ])('$major.homeSets–$major.awaySets → $expected', ({ major, expected }) => {
    expect(majorWinner(major)).toBe(expected);
  });

  it.each([
    { homeSets: 2, awaySets: 2 },
    { homeSets: -1, awaySets: 3 },
    { homeSets: 1.5, awaySets: 3 },
  ])('throws for $homeSets–$awaySets', (major) => {
    expect(() => majorWinner(major)).toThrow();
  });
});

describe('validateSetLine', () => {
  it.each([
    {
      name: 'home 3–0',
      sets: s('25-20', '25-18', '25-23'),
      format: DEFAULT_FORMAT,
      major: { homeSets: 3, awaySets: 0 },
      winner: 'home',
      totals: { home: 75, away: 61 },
    },
    {
      name: 'home 3–1 with deuce',
      sets: s('25-20', '23-25', '27-25', '25-18'),
      format: DEFAULT_FORMAT,
      major: { homeSets: 3, awaySets: 1 },
      winner: 'home',
      totals: { home: 100, away: 88 },
    },
    {
      name: 'away 2–3 with a deciding set to 15',
      sets: s('25-20', '20-25', '25-23', '22-25', '13-15'),
      format: DEFAULT_FORMAT,
      major: { homeSets: 2, awaySets: 3 },
      winner: 'away',
      totals: { home: 105, away: 108 },
    },
    {
      name: 'deciding set past 15',
      sets: s('25-20', '20-25', '25-23', '22-25', '18-16'),
      format: DEFAULT_FORMAT,
      major: { homeSets: 3, awaySets: 2 },
      winner: 'home',
      totals: { home: 110, away: 109 },
    },
    {
      name: 'best of 3, 2–1',
      sets: s('25-20', '20-25', '15-11'),
      format: BO3,
      major: { homeSets: 2, awaySets: 1 },
      winner: 'home',
      totals: { home: 60, away: 56 },
    },
  ])('accepts $name', ({ sets, format, major, winner, totals }) => {
    expect(validateSetLine(sets, format)).toEqual({ ok: true, summary: { major, winner, totals } });
  });

  it.each<{
    name: string;
    sets: SetLine;
    format: MatchFormat;
    issues: { code: SetLineIssueCode; setIndex?: number }[];
  }>([
    { name: 'no sets', sets: [], format: DEFAULT_FORMAT, issues: [{ code: 'NO_SETS' }] },
    {
      name: 'six sets',
      sets: s('25-20', '20-25', '25-20', '20-25', '15-10', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'TOO_MANY_SETS' }],
    },
    {
      name: 'a tied set',
      sets: s('25-25', '25-20', '25-20', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'TIED_SET', setIndex: 0 }],
    },
    {
      name: 'a 25–24 set',
      sets: s('25-24', '25-20', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'INVALID_SET_SCORE', setIndex: 0 }],
    },
    {
      name: 'a deciding set played to 25',
      sets: s('25-20', '20-25', '25-20', '20-25', '25-13'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'INVALID_SET_SCORE', setIndex: 4 }],
    },
    {
      name: 'a fractional score',
      sets: s('25.5-23', '25-20', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'INVALID_SET_SCORE', setIndex: 0 }],
    },
    {
      name: 'only two sets of a best of 5',
      sets: s('25-20', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'MATCH_NOT_DECIDED' }],
    },
    {
      name: 'level after four sets',
      sets: s('25-20', '20-25', '25-20', '20-25'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'MATCH_NOT_DECIDED' }],
    },
    {
      name: 'a fourth set after 3–0',
      sets: s('25-20', '25-20', '25-20', '20-25'),
      format: DEFAULT_FORMAT,
      issues: [{ code: 'SET_AFTER_MATCH_DECIDED', setIndex: 3 }],
    },
    {
      name: 'two sets after 3–0',
      sets: s('25-20', '25-20', '25-20', '20-25', '15-10'),
      format: DEFAULT_FORMAT,
      issues: [
        { code: 'SET_AFTER_MATCH_DECIDED', setIndex: 3 },
        { code: 'SET_AFTER_MATCH_DECIDED', setIndex: 4 },
      ],
    },
    {
      name: 'a third set after 2–0 in a best of 3',
      sets: s('25-20', '25-20', '15-10'),
      format: BO3,
      issues: [{ code: 'SET_AFTER_MATCH_DECIDED', setIndex: 2 }],
    },
    {
      name: 'several problems at once',
      sets: s('25-24', '25-25', '25-20'),
      format: DEFAULT_FORMAT,
      issues: [
        { code: 'INVALID_SET_SCORE', setIndex: 0 },
        { code: 'TIED_SET', setIndex: 1 },
        { code: 'MATCH_NOT_DECIDED' },
      ],
    },
  ])('rejects $name', ({ sets, format, issues }) => {
    const result = validateSetLine(sets, format);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(({ code, setIndex }) => ({ code, setIndex }))).toEqual(issues);
    for (const issue of result.issues) expect(issue.message.length).toBeGreaterThan(10);
  });

  it.each([
    {
      sets: s('25-20', '25-24', '25-20'),
      message: 'Set 2: a set ends at 25 points with a 2-point lead, like 25–23 or 27–25.',
    },
    {
      sets: s('25-20', '20-25', '25-20', '20-25', '25-13'),
      message:
        'Set 5: the deciding set ends at 15 points with a 2-point lead, like 15–13 or 17–15.',
    },
  ])('explains the rule in plain words: $message', ({ sets, message }) => {
    const result = validateSetLine(sets, DEFAULT_FORMAT);
    expect(result.ok ? [] : result.issues.map((issue) => issue.message)).toEqual([message]);
  });
});

describe('summarizeSetLine', () => {
  it.each([
    {
      sets: s('25-20', '23-25', '25-22', '25-18'),
      expected: {
        major: { homeSets: 3, awaySets: 1 },
        winner: 'home',
        totals: { home: 98, away: 85 },
      },
    },
    {
      sets: s('20-25', '18-25', '23-25'),
      expected: {
        major: { homeSets: 0, awaySets: 3 },
        winner: 'away',
        totals: { home: 61, away: 75 },
      },
    },
  ])('summarises $expected.major.homeSets–$expected.major.awaySets', ({ sets, expected }) => {
    expect(summarizeSetLine(sets)).toEqual(expected);
  });

  it.each([{ sets: s('25-20', '20-25') }, { sets: [] }])(
    'throws when level in sets',
    ({ sets }) => {
      expect(() => summarizeSetLine(sets)).toThrow();
    },
  );
});

describe('majorOutcomes', () => {
  it.each([
    {
      format: DEFAULT_FORMAT,
      expected: ['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'],
    },
    { format: BO3, expected: ['2-0', '2-1', '0-2', '1-2'] },
  ])('best of $format.bestOf', ({ format, expected }) => {
    const outcomes = majorOutcomes(format).map((m) => `${m.homeSets}-${m.awaySets}`);
    expect(outcomes).toEqual(expected);
  });
});

describe('isValidMajor', () => {
  it.each([
    { homeSets: 3, awaySets: 0, format: DEFAULT_FORMAT, valid: true },
    { homeSets: 3, awaySets: 2, format: DEFAULT_FORMAT, valid: true },
    { homeSets: 1, awaySets: 3, format: DEFAULT_FORMAT, valid: true },
    { homeSets: 3, awaySets: 3, format: DEFAULT_FORMAT, valid: false },
    { homeSets: 4, awaySets: 0, format: DEFAULT_FORMAT, valid: false },
    { homeSets: 2, awaySets: 1, format: DEFAULT_FORMAT, valid: false },
    { homeSets: 2, awaySets: 1, format: BO3, valid: true },
    { homeSets: 3, awaySets: 1, format: BO3, valid: false },
    { homeSets: 3, awaySets: -1, format: DEFAULT_FORMAT, valid: false },
    { homeSets: 3, awaySets: 0.5, format: DEFAULT_FORMAT, valid: false },
  ])('$homeSets–$awaySets in best of $format.bestOf → $valid', (row) => {
    expect(isValidMajor({ homeSets: row.homeSets, awaySets: row.awaySets }, row.format)).toBe(
      row.valid,
    );
  });
});

describe('defaultSetWinners', () => {
  it.each<{ major: MajorScore; expected: Side[] }>([
    { major: { homeSets: 3, awaySets: 0 }, expected: [H, H, H] },
    { major: { homeSets: 3, awaySets: 1 }, expected: [H, A, H, H] },
    { major: { homeSets: 3, awaySets: 2 }, expected: [H, A, H, A, H] },
    { major: { homeSets: 1, awaySets: 3 }, expected: [A, H, A, A] },
    { major: { homeSets: 2, awaySets: 3 }, expected: [A, H, A, H, A] },
    { major: { homeSets: 0, awaySets: 3 }, expected: [A, A, A] },
    { major: { homeSets: 2, awaySets: 1 }, expected: [H, A, H] },
  ])('$major.homeSets–$major.awaySets', ({ major, expected }) => {
    expect(defaultSetWinners(major)).toEqual(expected);
  });

  it('throws for a level score', () => {
    expect(() => defaultSetWinners({ homeSets: 2, awaySets: 2 })).toThrow();
  });

  it('is valid for every outcome of both formats', () => {
    for (const format of [DEFAULT_FORMAT, BO3]) {
      for (const major of majorOutcomes(format)) {
        expect(isValidSetWinners(defaultSetWinners(major), major, format)).toBe(true);
      }
    }
  });
});

describe('isValidSetWinners', () => {
  it.each<{ winners: Side[]; major: MajorScore; format: MatchFormat; valid: boolean }>([
    {
      winners: [H, A, H, H],
      major: { homeSets: 3, awaySets: 1 },
      format: DEFAULT_FORMAT,
      valid: true,
    },
    {
      winners: [A, H, H, H],
      major: { homeSets: 3, awaySets: 1 },
      format: DEFAULT_FORMAT,
      valid: true,
    },
    {
      winners: [H, H, H, A],
      major: { homeSets: 3, awaySets: 1 },
      format: DEFAULT_FORMAT,
      valid: false,
    },
    {
      winners: [H, A, H],
      major: { homeSets: 3, awaySets: 1 },
      format: DEFAULT_FORMAT,
      valid: false,
    },
    {
      winners: [H, A, A, H],
      major: { homeSets: 3, awaySets: 1 },
      format: DEFAULT_FORMAT,
      valid: false,
    },
    {
      winners: [H, H, A, A, H],
      major: { homeSets: 3, awaySets: 2 },
      format: DEFAULT_FORMAT,
      valid: true,
    },
    {
      winners: [H, H, H, A, A],
      major: { homeSets: 3, awaySets: 2 },
      format: DEFAULT_FORMAT,
      valid: false,
    },
    {
      winners: [H, H, H],
      major: { homeSets: 3, awaySets: 0 },
      format: DEFAULT_FORMAT,
      valid: true,
    },
    {
      winners: [H, H, H, H],
      major: { homeSets: 4, awaySets: 0 },
      format: DEFAULT_FORMAT,
      valid: false,
    },
    { winners: [A, H, H], major: { homeSets: 2, awaySets: 1 }, format: BO3, valid: true },
    { winners: [H, H, A], major: { homeSets: 2, awaySets: 1 }, format: BO3, valid: false },
  ])(
    '$winners for $major.homeSets–$major.awaySets → $valid',
    ({ winners, major, format, valid }) => {
      expect(isValidSetWinners(winners, major, format)).toBe(valid);
    },
  );

  it('rejects values that are not sides', () => {
    const winners = ['home', 'away', 'home', 'draw'] as unknown as Side[];
    expect(isValidSetWinners(winners, { homeSets: 3, awaySets: 1 }, DEFAULT_FORMAT)).toBe(false);
  });
});

describe('buildSetLine', () => {
  it.each<{ winners: Side[]; losers: number[]; format: MatchFormat; expected: SetLine }>([
    {
      winners: [H, A, H, H],
      losers: [20, 23, 22, 18],
      format: DEFAULT_FORMAT,
      expected: s('25-20', '23-25', '25-22', '25-18'),
    },
    { winners: [H], losers: [24], format: DEFAULT_FORMAT, expected: s('26-24') },
    {
      winners: [H, A, H, A, H],
      losers: [20, 20, 20, 20, 13],
      format: DEFAULT_FORMAT,
      expected: s('25-20', '20-25', '25-20', '20-25', '15-13'),
    },
    {
      winners: [H, A, A, H, A],
      losers: [20, 20, 30, 20, 14],
      format: DEFAULT_FORMAT,
      expected: s('25-20', '20-25', '30-32', '25-20', '14-16'),
    },
    {
      winners: [A, H, A],
      losers: [10, 10, 10],
      format: BO3,
      expected: s('10-25', '25-10', '10-15'),
    },
  ])('builds $expected.length sets', ({ winners, losers, format, expected }) => {
    expect(buildSetLine(winners, losers, format)).toEqual(expected);
  });

  it('throws when the lengths differ', () => {
    expect(() => buildSetLine([H, A, H], [20, 20], DEFAULT_FORMAT)).toThrow();
  });

  it('always builds a valid set line for the chosen score', () => {
    const outcome = fc.constantFrom(
      ...[DEFAULT_FORMAT, BO3].flatMap((format) =>
        majorOutcomes(format).map((major) => ({ format, major })),
      ),
    );
    fc.assert(
      fc.property(
        outcome,
        fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 5, maxLength: 5 }),
        ({ format, major }, losers) => {
          const winners = defaultSetWinners(major);
          const sets = buildSetLine(winners, losers.slice(0, winners.length), format);
          const result = validateSetLine(sets, format);
          expect(result.ok && result.summary.major).toEqual(major);
        },
      ),
    );
  });
});
