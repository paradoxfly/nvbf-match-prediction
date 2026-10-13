import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareIds, compareScores, DEFAULT_TIE_BREAKERS, rankEntries } from './ranking';
import type { EntryScore, RankInput, TieBreaker } from './types';

function score(points: number, closeness = 0, exactCount = 0, winnerCount = 0): EntryScore {
  return { points, closeness, exactCount, winnerCount, scoredMatches: 10, countedPredictions: 10 };
}

function row(entryId: string, entryScore: EntryScore, eligible = true): RankInput {
  return { entryId, score: entryScore, eligible };
}

describe('compareIds', () => {
  it.each([
    ['a', 'b', -1],
    ['b', 'a', 1],
    ['a', 'a', 0],
    ['B', 'a', -1],
    ['e10', 'e9', -1],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(Math.sign(compareIds(a, b))).toBe(expected);
  });
});

describe('compareScores', () => {
  it.each<{ name: string; a: EntryScore; b: EntryScore; tieBreakers: TieBreaker[]; sign: number }>([
    {
      name: 'more points first',
      a: score(10),
      b: score(7),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: -1,
    },
    {
      name: 'fewer points second',
      a: score(7, 0),
      b: score(10, 50),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: 1,
    },
    {
      name: 'closer set scores first',
      a: score(10, 5),
      b: score(10, 9),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: -1,
    },
    {
      name: 'then more exact scores',
      a: score(10, 5, 1),
      b: score(10, 5, 2),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: 1,
    },
    {
      name: 'then more correct winners',
      a: score(10, 5, 2, 4),
      b: score(10, 5, 2, 3),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: -1,
    },
    {
      name: 'fully level',
      a: score(10, 5, 2, 3),
      b: score(10, 5, 2, 3),
      tieBreakers: DEFAULT_TIE_BREAKERS,
      sign: 0,
    },
    {
      name: 'no tie-breakers',
      a: score(10, 1, 9, 9),
      b: score(10, 9, 0, 0),
      tieBreakers: [],
      sign: 0,
    },
    {
      name: 'configured order wins',
      a: score(10, 1, 1),
      b: score(10, 9, 2),
      tieBreakers: ['exactScores', 'closeness'],
      sign: 1,
    },
    {
      name: 'unused tie-breakers are skipped',
      a: score(10, 1, 1, 1),
      b: score(10, 9, 1, 2),
      tieBreakers: ['correctWinners'],
      sign: 1,
    },
  ])('$name', ({ a, b, tieBreakers, sign }) => {
    expect(Math.sign(compareScores(a, b, tieBreakers))).toBe(sign);
    expect(Math.sign(compareScores(b, a, tieBreakers))).toBe(sign === 0 ? 0 : -sign);
  });

  it('throws on an unknown tie-breaker', () => {
    const unknown = ['fastest'] as unknown as TieBreaker[];
    expect(() => compareScores(score(1), score(1), unknown)).toThrow(/fastest/);
  });
});

describe('rankEntries', () => {
  it.each<{
    name: string;
    rows: RankInput[];
    tieBreakers: TieBreaker[];
    expected: [entryId: string, rank: number, groupStart: number, groupEnd: number][];
  }>([
    {
      name: 'competition ranking 1, 2, 2, 4',
      rows: [
        row('e4', score(7)),
        row('e3', score(8, 3)),
        row('e1', score(10)),
        row('e2', score(8, 3)),
      ],
      tieBreakers: DEFAULT_TIE_BREAKERS,
      expected: [
        ['e1', 1, 1, 1],
        ['e2', 2, 2, 3],
        ['e3', 2, 2, 3],
        ['e4', 4, 4, 4],
      ],
    },
    {
      name: 'tie-breakers split equal points',
      rows: [row('a', score(8, 9)), row('b', score(8, 3)), row('c', score(8, 3, 1))],
      tieBreakers: DEFAULT_TIE_BREAKERS,
      expected: [
        ['c', 1, 1, 1],
        ['b', 2, 2, 2],
        ['a', 3, 3, 3],
      ],
    },
    {
      name: 'without tie-breakers equal points share a rank',
      rows: [row('a', score(8, 9)), row('b', score(8, 3)), row('c', score(5))],
      tieBreakers: [],
      expected: [
        ['a', 1, 1, 2],
        ['b', 1, 1, 2],
        ['c', 3, 3, 3],
      ],
    },
    {
      name: 'ineligible rows are dropped before ranking',
      rows: [
        row('x', score(20), false),
        row('a', score(5)),
        row('b', score(5)),
        row('c', score(1)),
      ],
      tieBreakers: DEFAULT_TIE_BREAKERS,
      expected: [
        ['a', 1, 1, 2],
        ['b', 1, 1, 2],
        ['c', 3, 3, 3],
      ],
    },
    {
      name: 'everyone level',
      rows: [row('c', score(3)), row('a', score(3)), row('b', score(3))],
      tieBreakers: DEFAULT_TIE_BREAKERS,
      expected: [
        ['a', 1, 1, 3],
        ['b', 1, 1, 3],
        ['c', 1, 1, 3],
      ],
    },
    { name: 'nobody eligible', rows: [row('a', score(3), false)], tieBreakers: [], expected: [] },
  ])('$name', ({ rows, tieBreakers, expected }) => {
    const ranked = rankEntries(rows, tieBreakers);
    expect(ranked.map((r) => [r.entryId, r.rank, r.groupStart, r.groupEnd])).toEqual(expected);
    for (const entry of ranked) {
      expect(entry.groupSize).toBe(entry.groupEnd - entry.groupStart + 1);
    }
  });

  it('throws on a duplicate entry', () => {
    expect(() => rankEntries([row('a', score(1)), row('a', score(2))], [])).toThrow(/a/);
  });

  it('gives the same ranks whatever the input order', () => {
    const rowsArb = fc
      .array(
        fc.record({
          points: fc.integer({ min: 0, max: 6 }),
          closeness: fc.integer({ min: 0, max: 3 }),
          exactCount: fc.integer({ min: 0, max: 2 }),
          winnerCount: fc.integer({ min: 0, max: 2 }),
          eligible: fc.boolean(),
        }),
        { maxLength: 30 },
      )
      .map((items) =>
        items.map((item, index) =>
          row(
            `e${index}`,
            score(item.points, item.closeness, item.exactCount, item.winnerCount),
            item.eligible,
          ),
        ),
      )
      .chain((rows) =>
        fc.tuple(
          fc.constant(rows),
          fc.shuffledSubarray(rows, { minLength: rows.length, maxLength: rows.length }),
        ),
      );
    const tieBreakersArb = fc.shuffledSubarray<TieBreaker>(
      ['closeness', 'exactScores', 'correctWinners'],
      { minLength: 0, maxLength: 3 },
    );

    fc.assert(
      fc.property(rowsArb, tieBreakersArb, ([rows, shuffled], tieBreakers) => {
        const ranksById = (input: RankInput[]) =>
          Object.fromEntries(
            rankEntries(input, tieBreakers).map((r) => [
              r.entryId,
              [r.rank, r.groupStart, r.groupEnd, r.groupSize],
            ]),
          );
        expect(ranksById(shuffled)).toEqual(ranksById(rows));
        expect(rankEntries(shuffled, tieBreakers)).toEqual(rankEntries(rows, tieBreakers));
      }),
    );
  });

  it('never ranks a lower score ahead of a higher one', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 20 }), (points) => {
        const ranked = rankEntries(
          points.map((p, i) => row(`e${i}`, score(p))),
          DEFAULT_TIE_BREAKERS,
        );
        for (let i = 1; i < ranked.length; i += 1) {
          const above = ranked[i - 1];
          const below = ranked[i];
          if (above === undefined || below === undefined) continue;
          expect(above.score.points).toBeGreaterThanOrEqual(below.score.points);
          expect(above.rank).toBeLessThanOrEqual(below.rank);
        }
      }),
    );
  });
});
