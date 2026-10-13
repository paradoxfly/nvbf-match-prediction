import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  allocatePrizes,
  assertKobo,
  BPS,
  computePool,
  DEFAULT_ENTRY_FEE_KOBO,
  DEFAULT_JACKPOT_BPS,
  DEFAULT_PRIZE_BPS,
  DEFAULT_PRIZE_TIERS_BPS,
  formatBps,
  formatNaira,
  largestRemainder,
  nairaToKobo,
  ordinal,
  placeAmounts,
  validatePrizeTiers,
} from './prizes';
import { DEFAULT_TIE_BREAKERS, rankEntries } from './ranking';
import type { PoolInput, RankedEntry } from './types';

const ZERO_SCORE = {
  points: 0,
  closeness: 0,
  exactCount: 0,
  winnerCount: 0,
  scoredMatches: 0,
  countedPredictions: 0,
};

/** Ranked entries p1, p2, … from tie-group sizes: [1, 2, 1] → p1 alone, p2+p3 tied, p4 alone. */
function rankedFromGroups(groupSizes: number[]): RankedEntry[] {
  const ranked: RankedEntry[] = [];
  let position = 1;
  for (const size of groupSizes) {
    for (let k = 0; k < size; k += 1) {
      ranked.push({
        entryId: `p${position + k}`,
        score: ZERO_SCORE,
        rank: position,
        groupStart: position,
        groupEnd: position + size - 1,
        groupSize: size,
      });
    }
    position += size;
  }
  return ranked;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** ₦10,000 with the default split. */
const POOL = 1_000_000;
const DEFAULT_AMOUNTS = [
  400_000, 200_000, 125_000, 75_000, 50_000, 40_000, 30_000, 30_000, 25_000, 25_000,
];
/** ₦10,000 over the first 6 places (weights sum to 8900), worked out by hand. */
const SIX_PLACE_AMOUNTS = [449_438, 224_719, 140_449, 84_270, 56_180, 44_944];

describe('constants', () => {
  it('default prize split adds up to 100%', () => {
    expect(sum(DEFAULT_PRIZE_TIERS_BPS)).toBe(BPS);
    expect(validatePrizeTiers(DEFAULT_PRIZE_TIERS_BPS)).toEqual([]);
  });

  it('default entry fee is ₦500', () => {
    expect(formatNaira(DEFAULT_ENTRY_FEE_KOBO)).toBe('₦500');
  });
});

describe('assertKobo', () => {
  it.each([0, 1, 50_000, Number.MAX_SAFE_INTEGER])('accepts %s', (value) => {
    expect(() => assertKobo(value)).not.toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '5', null])(
    'rejects %s',
    (value) => {
      expect(() => assertKobo(value, 'Fee')).toThrow(/Fee/);
    },
  );
});

describe('formatBps', () => {
  it.each([
    [8000, '80%'],
    [1250, '12.5%'],
    [750, '7.5%'],
    [10_000, '100%'],
    [0, '0%'],
    [5, '0.05%'],
    [10, '0.1%'],
    [9999, '99.99%'],
  ])('%i → %s', (bps, expected) => {
    expect(formatBps(bps)).toBe(expected);
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
  ])('%i → %s', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });
});

describe('computePool', () => {
  const defaults: PoolInput = {
    confirmedCount: 100,
    entryFeeKobo: DEFAULT_ENTRY_FEE_KOBO,
    prizeBps: DEFAULT_PRIZE_BPS,
    jackpotBps: DEFAULT_JACKPOT_BPS,
    contributionsKobo: 0,
  };

  it.each<{ name: string; input: PoolInput; expected: Record<string, number> }>([
    {
      name: '100 entries at ₦500',
      input: defaults,
      expected: {
        revenueKobo: 5_000_000,
        participantShareKobo: 4_000_000,
        jackpotCutKobo: 400_000,
        contributionsKobo: 0,
        dailyPoolKobo: 3_600_000,
        operationsKobo: 1_000_000,
      },
    },
    {
      name: 'sponsor money goes straight into the daily pool',
      input: { ...defaults, contributionsKobo: 250_000 },
      expected: {
        revenueKobo: 5_000_000,
        participantShareKobo: 4_000_000,
        jackpotCutKobo: 400_000,
        contributionsKobo: 250_000,
        dailyPoolKobo: 3_850_000,
        operationsKobo: 1_000_000,
      },
    },
    {
      name: 'fractions of a kobo round down',
      input: { ...defaults, confirmedCount: 3, entryFeeKobo: 333 },
      expected: {
        revenueKobo: 999,
        participantShareKobo: 799,
        jackpotCutKobo: 79,
        contributionsKobo: 0,
        dailyPoolKobo: 720,
        operationsKobo: 200,
      },
    },
    {
      name: 'no entries, sponsor only',
      input: { ...defaults, confirmedCount: 0, contributionsKobo: 100_000 },
      expected: {
        revenueKobo: 0,
        participantShareKobo: 0,
        jackpotCutKobo: 0,
        contributionsKobo: 100_000,
        dailyPoolKobo: 100_000,
        operationsKobo: 0,
      },
    },
    {
      name: 'all fees to prizes, no jackpot',
      input: { ...defaults, prizeBps: BPS, jackpotBps: 0 },
      expected: {
        revenueKobo: 5_000_000,
        participantShareKobo: 5_000_000,
        jackpotCutKobo: 0,
        contributionsKobo: 0,
        dailyPoolKobo: 5_000_000,
        operationsKobo: 0,
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(computePool(input)).toEqual(expected);
  });

  it.each<{ name: string; input: PoolInput }>([
    { name: 'prizeBps above 100%', input: { ...defaults, prizeBps: BPS + 1 } },
    { name: 'negative jackpotBps', input: { ...defaults, jackpotBps: -1 } },
    { name: 'fractional bps', input: { ...defaults, prizeBps: 80.5 } },
    { name: 'negative count', input: { ...defaults, confirmedCount: -1 } },
    { name: 'fractional count', input: { ...defaults, confirmedCount: 1.5 } },
    { name: 'negative fee', input: { ...defaults, entryFeeKobo: -1 } },
    { name: 'fractional contribution', input: { ...defaults, contributionsKobo: 0.5 } },
    {
      name: 'revenue too big',
      input: { ...defaults, confirmedCount: 2 ** 40, entryFeeKobo: 2 ** 20 },
    },
  ])('throws on $name', ({ input }) => {
    expect(() => computePool(input)).toThrow();
  });

  it('never loses or creates a kobo', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: BPS }),
        fc.integer({ min: 0, max: BPS }),
        fc.integer({ min: 0, max: 1_000_000_000 }),
        (confirmedCount, entryFeeKobo, prizeBps, jackpotBps, contributionsKobo) => {
          const pool = computePool({
            confirmedCount,
            entryFeeKobo,
            prizeBps,
            jackpotBps,
            contributionsKobo,
          });
          expect(pool.revenueKobo).toBe(confirmedCount * entryFeeKobo);
          expect(
            pool.participantShareKobo -
              pool.jackpotCutKobo +
              pool.jackpotCutKobo +
              pool.operationsKobo,
          ).toBe(pool.revenueKobo);
          expect(pool.dailyPoolKobo).toBe(
            pool.participantShareKobo - pool.jackpotCutKobo + contributionsKobo,
          );
          for (const value of Object.values(pool)) {
            expect(Number.isSafeInteger(value) && value >= 0).toBe(true);
          }
        },
      ),
    );
  });
});

describe('largestRemainder', () => {
  it.each<{ total: number; weights: number[]; expected: number[] }>([
    { total: 100, weights: [1, 1, 1], expected: [34, 33, 33] },
    { total: 10, weights: [1, 1, 1, 1], expected: [3, 3, 2, 2] },
    { total: 0, weights: [1, 2], expected: [0, 0] },
    { total: 7, weights: [0, 1], expected: [0, 7] },
    { total: 1, weights: [1, 1], expected: [1, 0] },
    { total: 2, weights: [1, 2, 1], expected: [1, 1, 0] },
    { total: 5, weights: [2, 3], expected: [2, 3] },
    { total: POOL, weights: DEFAULT_PRIZE_TIERS_BPS, expected: DEFAULT_AMOUNTS },
    { total: POOL, weights: DEFAULT_PRIZE_TIERS_BPS.slice(0, 6), expected: SIX_PLACE_AMOUNTS },
    {
      total: Number.MAX_SAFE_INTEGER,
      weights: [1, 1],
      expected: [4_503_599_627_370_496, 4_503_599_627_370_495],
    },
  ])('splits $total by $weights', ({ total, weights, expected }) => {
    expect(largestRemainder(total, weights)).toEqual(expected);
  });

  it.each<{ name: string; total: number; weights: number[] }>([
    { name: 'no weights', total: 10, weights: [] },
    { name: 'all-zero weights', total: 10, weights: [0, 0] },
    { name: 'a negative weight', total: 10, weights: [-1, 2] },
    { name: 'a fractional weight', total: 10, weights: [1.5, 1] },
    { name: 'a negative total', total: -1, weights: [1] },
    { name: 'a fractional total', total: 1.5, weights: [1] },
  ])('throws on $name', ({ total, weights }) => {
    expect(() => largestRemainder(total, weights)).toThrow();
  });

  it('always adds up exactly, each part within a kobo of its fair share', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
        fc
          .array(fc.integer({ min: 0, max: 100_000 }), { minLength: 1, maxLength: 30 })
          .filter((weights) => sum(weights) > 0),
        (total, weights) => {
          const parts = largestRemainder(total, weights);
          const weightSum = BigInt(sum(weights));
          expect(parts.reduce((acc, part) => acc + BigInt(part), 0n)).toBe(BigInt(total));
          parts.forEach((part, index) => {
            const fairFloor = (BigInt(total) * BigInt(weights[index] ?? 0)) / weightSum;
            expect(BigInt(part) - fairFloor).toBeGreaterThanOrEqual(0n);
            expect(BigInt(part) - fairFloor).toBeLessThanOrEqual(1n);
          });
        },
      ),
    );
  });
});

describe('validatePrizeTiers', () => {
  it.each([
    { tiers: DEFAULT_PRIZE_TIERS_BPS },
    { tiers: [10_000] },
    { tiers: [5000, 5000] },
    { tiers: [7000, 2000, 1000] },
  ])('accepts $tiers', ({ tiers }) => {
    expect(validatePrizeTiers(tiers)).toEqual([]);
  });

  it.each<{ name: string; tiers: number[]; problems: RegExp[] }>([
    { name: 'no places', tiers: [], problems: [/at least one prize place/] },
    { name: 'not 100%', tiers: [5000, 4000], problems: [/add up to 90%.*exactly 100%/] },
    {
      name: 'a lower place getting more',
      tiers: [4000, 6000],
      problems: [/2nd place \(60%\) gets more than 1st place \(40%\)/],
    },
    { name: 'a zero place', tiers: [5000, 0, 5000], problems: [/2nd place must get more than 0%/] },
    {
      name: 'fractions of a basis point',
      tiers: [5000.5, 4999.5],
      problems: [/1st place must be a whole number/, /2nd place must be a whole number/],
    },
    {
      name: 'too many places',
      tiers: Array.from({ length: 101 }, () => 99),
      problems: [/at most 100 prize places/, /add up to 99\.99%/],
    },
  ])('rejects $name', ({ tiers, problems }) => {
    const found = validatePrizeTiers(tiers);
    expect(found).toHaveLength(problems.length);
    problems.forEach((pattern, index) => expect(found[index]).toMatch(pattern));
  });
});

describe('placeAmounts', () => {
  it.each<{ name: string; pool: number; tiers: number[]; eligible: number; expected: number[] }>([
    {
      name: 'all 10 places',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 10,
      expected: DEFAULT_AMOUNTS,
    },
    {
      name: 'more players than places',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 250,
      expected: DEFAULT_AMOUNTS,
    },
    {
      name: '6 players: unused share spread over the 6 paid places',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 6,
      expected: SIX_PLACE_AMOUNTS,
    },
    {
      name: 'one player takes everything',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 1,
      expected: [POOL],
    },
    {
      name: 'nobody eligible',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 0,
      expected: [],
    },
    {
      name: 'empty pool',
      pool: 0,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      eligible: 3,
      expected: [0, 0, 0],
    },
    { name: 'winner takes all', pool: POOL, tiers: [10_000], eligible: 5, expected: [POOL] },
  ])('$name', ({ pool, tiers, eligible, expected }) => {
    const amounts = placeAmounts(pool, tiers, eligible);
    expect(amounts).toEqual(expected);
    if (amounts.length > 0) expect(sum(amounts)).toBe(pool);
  });

  it.each([
    { name: 'invalid tiers', pool: POOL, tiers: [5000, 4000], eligible: 3 },
    { name: 'negative eligible count', pool: POOL, tiers: [10_000], eligible: -1 },
    { name: 'fractional pool', pool: 10.5, tiers: [10_000], eligible: 1 },
  ])('throws on $name', ({ pool, tiers, eligible }) => {
    expect(() => placeAmounts(pool, tiers, eligible)).toThrow();
  });
});

describe('allocatePrizes', () => {
  it.each<{
    name: string;
    pool: number;
    tiers: number[];
    groups: number[];
    awards: [entryId: string, rank: number, amountKobo: number][];
    rounding: number;
  }>([
    {
      name: 'no ties: each place gets its prize',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      awards: DEFAULT_AMOUNTS.map((amount, index) => [`p${index + 1}`, index + 1, amount]),
      rounding: 0,
    },
    {
      name: 'PRD example: two tie for 2nd and 3rd, the next player is 4th',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 2, 1, 1, 1, 1, 1, 1, 1],
      awards: [
        ['p1', 1, 400_000],
        ['p2', 2, 162_500],
        ['p3', 2, 162_500],
        ['p4', 4, 75_000],
        ['p5', 5, 50_000],
        ['p6', 6, 40_000],
        ['p7', 7, 30_000],
        ['p8', 8, 30_000],
        ['p9', 9, 25_000],
        ['p10', 10, 25_000],
      ],
      rounding: 0,
    },
    {
      name: 'three-way tie at 9th shares the 9th and 10th prizes',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 1, 1, 1, 1, 1, 1, 1, 3],
      awards: [
        ...DEFAULT_AMOUNTS.slice(0, 8).map((amount, index): [string, number, number] => [
          `p${index + 1}`,
          index + 1,
          amount,
        ]),
        ['p9', 9, 16_666],
        ['p10', 9, 16_666],
        ['p11', 9, 16_666],
      ],
      rounding: 2,
    },
    {
      name: 'a tie starting after the last paid place gets nothing',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
      awards: DEFAULT_AMOUNTS.map((amount, index) => [`p${index + 1}`, index + 1, amount]),
      rounding: 0,
    },
    {
      name: 'three-way tie for 1st shares the top three prizes',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [3, 1, 1, 1, 1, 1, 1, 1],
      awards: [
        ['p1', 1, 241_666],
        ['p2', 1, 241_666],
        ['p3', 1, 241_666],
        ...DEFAULT_AMOUNTS.slice(3).map((amount, index): [string, number, number] => [
          `p${index + 4}`,
          index + 4,
          amount,
        ]),
      ],
      rounding: 2,
    },
    {
      name: 'three-way tie for 1st with only 4 players (4 places paid in proportion)',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [3, 1],
      awards: [
        ['p1', 1, 302_083],
        ['p2', 1, 302_083],
        ['p3', 1, 302_083],
        ['p4', 4, 93_750],
      ],
      rounding: 1,
    },
    {
      name: '6 players for 10 places: the whole pool is paid out',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 1, 1, 1, 1, 1],
      awards: SIX_PLACE_AMOUNTS.map((amount, index) => [`p${index + 1}`, index + 1, amount]),
      rounding: 0,
    },
    {
      name: '6 players in two tie groups',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [2, 4],
      awards: [
        ['p1', 1, 337_078],
        ['p2', 1, 337_078],
        ['p3', 3, 81_460],
        ['p4', 3, 81_460],
        ['p5', 3, 81_460],
        ['p6', 3, 81_460],
      ],
      rounding: 1 + 3,
    },
    {
      name: 'an odd kobo left over from a tie goes to operations',
      pool: 101,
      tiers: [6000, 4000],
      groups: [2],
      awards: [
        ['p1', 1, 50],
        ['p2', 1, 50],
      ],
      rounding: 1,
    },
    {
      name: 'an empty pool pays 0 to the places',
      pool: 0,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [1, 2],
      awards: [
        ['p1', 1, 0],
        ['p2', 2, 0],
        ['p3', 2, 0],
      ],
      rounding: 0,
    },
    {
      name: 'nobody ranked',
      pool: POOL,
      tiers: DEFAULT_PRIZE_TIERS_BPS,
      groups: [],
      awards: [],
      rounding: 0,
    },
  ])('$name', ({ pool, tiers, groups, awards, rounding }) => {
    const ranked = rankedFromGroups(groups);
    const allocation = allocatePrizes(pool, tiers, ranked);
    expect(allocation.awards.map((a) => [a.entryId, a.rank, a.amountKobo])).toEqual(awards);
    expect(allocation.roundingToOpsKobo).toBe(rounding);
    expect(allocation.placeAmountsKobo).toEqual(placeAmounts(pool, tiers, ranked.length));
    if (ranked.length > 0) {
      expect(sum(allocation.awards.map((a) => a.amountKobo)) + rounding).toBe(pool);
    }
  });

  it.each<{ name: string; ranked: RankedEntry[] }>([
    {
      name: 'a group that does not start at its position',
      ranked: rankedFromGroups([1, 1]).map((entry, index) =>
        index === 1 ? { ...entry, groupStart: 1, rank: 1, groupEnd: 2, groupSize: 2 } : entry,
      ),
    },
    {
      name: 'a group size that does not match',
      ranked: rankedFromGroups([2]).map((entry) => ({ ...entry, groupSize: 3 })),
    },
    {
      name: 'a rank that is not the group start',
      ranked: rankedFromGroups([1, 2]).map((entry) => ({ ...entry, rank: 1 })),
    },
    {
      name: 'the same entry twice',
      ranked: rankedFromGroups([1, 1]).map((entry) => ({ ...entry, entryId: 'p1' })),
    },
  ])('throws on $name', ({ ranked }) => {
    expect(() => allocatePrizes(POOL, DEFAULT_PRIZE_TIERS_BPS, ranked)).toThrow();
  });

  it('throws on an invalid prize split', () => {
    expect(() => allocatePrizes(POOL, [6000, 6000], rankedFromGroups([1]))).toThrow(/100%/);
  });

  const tiersArb = fc.oneof(
    fc.constant(DEFAULT_PRIZE_TIERS_BPS),
    fc
      .array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 15 })
      .map((weights) =>
        largestRemainder(
          BPS,
          [...weights].sort((a, b) => b - a),
        ),
      )
      .filter((tiers) => validatePrizeTiers(tiers).length === 0),
  );
  const rankedArb = fc
    .array(
      fc.record({
        points: fc.integer({ min: 0, max: 4 }),
        closeness: fc.integer({ min: 0, max: 2 }),
        eligible: fc.boolean(),
      }),
      { maxLength: 25 },
    )
    .map((rows) =>
      rankEntries(
        rows.map((r, index) => ({
          entryId: `e${index}`,
          eligible: r.eligible,
          score: { ...ZERO_SCORE, points: r.points, closeness: r.closeness },
        })),
        DEFAULT_TIE_BREAKERS,
      ),
    );

  it('always pays out the whole pool, fairly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000_000 }),
        tiersArb,
        rankedArb,
        (pool, tiers, ranked) => {
          const { awards, roundingToOpsKobo, placeAmountsKobo } = allocatePrizes(
            pool,
            tiers,
            ranked,
          );
          const paidPlaces = Math.min(tiers.length, ranked.length);
          expect(placeAmountsKobo).toHaveLength(paidPlaces);

          if (ranked.length === 0) {
            expect(awards).toEqual([]);
            expect(roundingToOpsKobo).toBe(0);
            return;
          }
          expect(sum(awards.map((a) => a.amountKobo)) + roundingToOpsKobo).toBe(pool);

          // Only tie groups that start on a paid place are paid, and each member gets the same.
          const paidEntries = ranked.filter((entry) => entry.groupStart <= paidPlaces);
          expect(awards.map((a) => a.entryId)).toEqual(paidEntries.map((e) => e.entryId));
          const groupStarts = new Set(paidEntries.map((entry) => entry.groupStart));
          expect(roundingToOpsKobo).toBeLessThan(Math.max(1, paidEntries.length));
          for (const start of groupStarts) {
            const shares = new Set(awards.filter((a) => a.rank === start).map((a) => a.amountKobo));
            expect(shares.size).toBe(1);
          }

          // A better rank never gets less money.
          for (let i = 1; i < awards.length; i += 1) {
            const above = awards[i - 1];
            const below = awards[i];
            if (above === undefined || below === undefined) continue;
            expect(above.amountKobo).toBeGreaterThanOrEqual(below.amountKobo);
          }
        },
      ),
    );
  });
});

describe('formatNaira', () => {
  it.each<[number, { kobo?: boolean } | undefined, string]>([
    [0, undefined, '₦0'],
    [50_000, undefined, '₦500'],
    [123_400, undefined, '₦1,234'],
    [123_450, undefined, '₦1,234.50'],
    [123_405, undefined, '₦1,234.05'],
    [99, undefined, '₦0.99'],
    [100_000_000, undefined, '₦1,000,000'],
    [50_000, { kobo: true }, '₦500.00'],
    [-150, undefined, '-₦1.50'],
    [Number.MAX_SAFE_INTEGER, undefined, '₦90,071,992,547,409.91'],
  ])('%i kobo (%o) → %s', (kobo, opts, expected) => {
    expect(formatNaira(kobo, opts)).toBe(expected);
  });

  it.each([1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])('throws on %s', (kobo) => {
    expect(() => formatNaira(kobo)).toThrow();
  });
});

describe('nairaToKobo', () => {
  it.each<[string | number, number]>([
    ['500', 50_000],
    ['1,234.5', 123_450],
    ['₦2,000.05', 200_005],
    [' ₦ 1,000 ', 100_000],
    ['N500', 50_000],
    ['NGN 1,500.75', 150_075],
    ['0.01', 1],
    ['0', 0],
    ['007', 700],
    ['1234567.89', 123_456_789],
    [1234.5, 123_450],
    [0.1, 10],
    [500, 50_000],
  ])('%o → %i kobo', (input, expected) => {
    expect(nairaToKobo(input)).toBe(expected);
  });

  it.each<string | number>([
    '1.234',
    '-5',
    '₦-5',
    '-₦5',
    'abc',
    '',
    '1,23',
    '12,3456',
    '1.',
    '.5',
    '1e3',
    'NaN',
    '5 000',
    '99999999999999999',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    0.1 + 0.2,
  ])('throws on %o', (input) => {
    expect(() => nairaToKobo(input)).toThrow();
  });

  it('reads back whatever formatNaira writes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), fc.boolean(), (kobo, k) => {
        expect(nairaToKobo(formatNaira(kobo, { kobo: k }))).toBe(kobo);
      }),
    );
  });
});
