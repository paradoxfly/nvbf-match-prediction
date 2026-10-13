import { describe, expect, it } from 'vitest';
import { normalizePrediction, pickJackpotWinner, rankJackpot, standingsDistance } from './jackpot';
import type { JackpotCandidate, StandingsOrders } from './types';

// Names sort the opposite way to ids, so tests can tell name order from id order.
const NAMES: Record<string, string> = {
  a: 'Zaria Spikers',
  b: 'Yola Blockers',
  c: 'Warri Waves',
  d: 'Uyo United',
  w1: 'Owerri Aces',
  w2: 'Makurdi Rockets',
  w3: 'Lokoja Lions',
};

const FINAL: StandingsOrders = { men: ['a', 'b', 'c', 'd'], women: ['w1', 'w2', 'w3'] };

describe('normalizePrediction', () => {
  it.each<{ name: string; predicted: string[]; finalOrder: string[]; expected: string[] }>([
    {
      name: 'a full prediction stays as it is',
      predicted: ['d', 'c', 'b', 'a'],
      finalOrder: ['a', 'b', 'c', 'd'],
      expected: ['d', 'c', 'b', 'a'],
    },
    {
      name: 'withdrawn teams are dropped',
      predicted: ['x', 'b', 'a', 'c', 'd'],
      finalOrder: ['a', 'b', 'c', 'd'],
      expected: ['b', 'a', 'c', 'd'],
    },
    {
      name: 'duplicates keep the first place',
      predicted: ['b', 'a', 'b', 'c', 'd'],
      finalOrder: ['a', 'b', 'c', 'd'],
      expected: ['b', 'a', 'c', 'd'],
    },
    {
      name: 'missing teams go to the bottom by name',
      predicted: ['b'],
      finalOrder: ['a', 'b', 'c', 'd'],
      expected: ['b', 'd', 'c', 'a'],
    },
    {
      name: 'an empty prediction is all by name',
      predicted: [],
      finalOrder: ['a', 'b', 'c', 'd'],
      expected: ['d', 'c', 'b', 'a'],
    },
    {
      name: 'unnamed teams sort by id',
      predicted: [],
      finalOrder: ['q2', 'q1'],
      expected: ['q1', 'q2'],
    },
  ])('$name', ({ predicted, finalOrder, expected }) => {
    expect(normalizePrediction(predicted, finalOrder, NAMES)).toEqual(expected);
  });

  it('throws when the final table lists a team twice', () => {
    expect(() => normalizePrediction([], ['a', 'a'], NAMES)).toThrow();
  });
});

describe('standingsDistance', () => {
  it.each<{ name: string; predicted: StandingsOrders; final: StandingsOrders; expected: number }>([
    { name: 'a perfect prediction', predicted: FINAL, final: FINAL, expected: 0 },
    {
      name: 'swapped neighbours',
      predicted: { men: ['b', 'a', 'c', 'd'], women: ['w1', 'w2', 'w3'] },
      final: FINAL,
      expected: 2,
    },
    {
      name: 'a fully reversed men’s table',
      predicted: { men: ['d', 'c', 'b', 'a'], women: ['w1', 'w2', 'w3'] },
      final: FINAL,
      expected: 3 + 1 + 1 + 3,
    },
    {
      name: 'both tables are added up',
      predicted: { men: ['b', 'a', 'c', 'd'], women: ['w3', 'w2', 'w1'] },
      final: FINAL,
      expected: 2 + 4,
    },
    {
      name: 'a withdrawn team is ignored',
      predicted: { men: ['a', 'x', 'b', 'c', 'd'], women: ['w1', 'w2', 'w3'] },
      final: FINAL,
      expected: 0,
    },
    {
      name: 'a team missing from the prediction goes last',
      // Normalised to b, c, d, a → b, c, d each one place off, a three places off.
      predicted: { men: ['b', 'c', 'd'], women: ['w1', 'w2', 'w3'] },
      final: FINAL,
      expected: 1 + 1 + 1 + 3,
    },
    {
      name: 'a missing category counts as an empty prediction',
      // Women normalised by name: w3, w2, w1 → 2 + 0 + 2.
      predicted: { men: ['a', 'b', 'c', 'd'] },
      final: FINAL,
      expected: 4,
    },
    {
      name: 'a category without a final table is not counted',
      predicted: { men: ['a', 'b', 'c', 'd'], women: ['w3', 'w2', 'w1'] },
      final: { men: FINAL.men },
      expected: 0,
    },
  ])('$name → $expected', ({ predicted, final, expected }) => {
    expect(standingsDistance(predicted, final, NAMES)).toBe(expected);
  });
});

describe('rankJackpot / pickJackpotWinner', () => {
  function candidate(
    entryId: string,
    men: string[],
    submittedAt: string,
    eligible = true,
  ): JackpotCandidate {
    return {
      entryId,
      orders: { men, women: ['w1', 'w2', 'w3'] },
      submittedAt: new Date(submittedAt),
      eligible,
    };
  }

  const perfect = ['a', 'b', 'c', 'd'];
  const swapped = ['b', 'a', 'c', 'd'];

  it.each<{
    name: string;
    candidates: JackpotCandidate[];
    expected: [entryId: string, distance: number, position: number][];
  }>([
    {
      name: 'the closest prediction wins',
      candidates: [
        candidate('e1', swapped, '2025-10-01T10:00:00Z'),
        candidate('e2', perfect, '2025-10-05T10:00:00Z'),
      ],
      expected: [
        ['e2', 0, 1],
        ['e1', 2, 2],
      ],
    },
    {
      name: 'equally close: the earlier submitted prediction wins',
      candidates: [
        candidate('e1', swapped, '2025-10-03T10:00:00Z'),
        candidate('e2', swapped, '2025-10-02T10:00:00Z'),
        candidate('e3', swapped, '2025-10-02T10:00:00Z'),
      ],
      expected: [
        ['e2', 2, 1],
        ['e3', 2, 2],
        ['e1', 2, 3],
      ],
    },
    {
      name: 'ineligible players are left out',
      candidates: [
        candidate('e1', perfect, '2025-10-01T10:00:00Z', false),
        candidate('e2', swapped, '2025-10-05T10:00:00Z'),
      ],
      expected: [['e2', 2, 1]],
    },
    { name: 'nobody', candidates: [], expected: [] },
  ])('$name', ({ candidates, expected }) => {
    const standings = rankJackpot(candidates, FINAL, NAMES);
    expect(standings.map((s) => [s.entryId, s.distance, s.position])).toEqual(expected);
    const winner = pickJackpotWinner(candidates, FINAL, NAMES);
    expect(winner?.entryId ?? null).toBe(expected[0]?.[0] ?? null);
  });

  it('returns null when nobody qualifies', () => {
    const candidates = [candidate('e1', perfect, '2025-10-01T10:00:00Z', false)];
    expect(pickJackpotWinner(candidates, FINAL, NAMES)).toBeNull();
  });

  it.each([
    {
      name: 'a duplicate entry',
      candidates: [
        candidate('e1', perfect, '2025-10-01T10:00:00Z'),
        candidate('e1', swapped, '2025-10-02T10:00:00Z'),
      ],
    },
    { name: 'an invalid date', candidates: [candidate('e1', perfect, 'not a date')] },
  ])('throws on $name', ({ candidates }) => {
    expect(() => rankJackpot(candidates, FINAL, NAMES)).toThrow();
  });
});
