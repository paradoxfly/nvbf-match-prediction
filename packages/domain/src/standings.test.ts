import { describe, expect, it } from 'vitest';
import {
  compareTeamNames,
  defaultStandingsOrder,
  FIVB_POINTS,
  standingsFromResults,
} from './standings';
import type { StandingsRow, TeamResult } from './types';

function result(home: string, homeSets: number, awaySets: number, away: string): TeamResult {
  return { homeTeamId: home, awayTeamId: away, homeSets, awaySets };
}

function row(teamId: string, points: number, setsWon: number, setsLost: number): StandingsRow {
  return { teamId, played: 0, won: 0, lost: 0, setsWon, setsLost, points };
}

describe('FIVB_POINTS', () => {
  it.each([
    ['3-0', 3],
    ['3-1', 3],
    ['3-2', 2],
    ['2-3', 1],
    ['1-3', 0],
    ['0-3', 0],
    ['2-0', 3],
    ['2-1', 2],
    ['1-2', 1],
    ['0-2', 0],
  ])('%s → %i', (key, points) => {
    expect(FIVB_POINTS[key]).toBe(points);
  });
});

describe('standingsFromResults', () => {
  it.each<{ name: string; teamIds: string[]; results: TeamResult[]; expected: StandingsRow[] }>([
    {
      name: 'a short best-of-5 season',
      teamIds: ['a', 'b', 'c', 'd'],
      results: [
        result('a', 3, 0, 'b'),
        result('c', 2, 3, 'a'),
        result('b', 3, 1, 'c'),
        result('x', 3, 0, 'a'), // x is not in this league (withdrawn): ignored
      ],
      expected: [
        { teamId: 'a', played: 2, won: 2, lost: 0, setsWon: 6, setsLost: 2, points: 5 },
        { teamId: 'b', played: 2, won: 1, lost: 1, setsWon: 3, setsLost: 4, points: 3 },
        { teamId: 'c', played: 2, won: 0, lost: 2, setsWon: 3, setsLost: 6, points: 1 },
        { teamId: 'd', played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, points: 0 },
      ],
    },
    {
      name: 'best of 3 results',
      teamIds: ['b', 'a'],
      results: [result('a', 2, 1, 'b'), result('b', 2, 0, 'a')],
      expected: [
        { teamId: 'b', played: 2, won: 1, lost: 1, setsWon: 3, setsLost: 2, points: 1 + 3 },
        { teamId: 'a', played: 2, won: 1, lost: 1, setsWon: 2, setsLost: 3, points: 2 + 0 },
      ],
    },
    {
      name: 'no results yet',
      teamIds: ['a', 'b'],
      results: [],
      expected: [
        { teamId: 'a', played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, points: 0 },
        { teamId: 'b', played: 0, won: 0, lost: 0, setsWon: 0, setsLost: 0, points: 0 },
      ],
    },
  ])('$name', ({ teamIds, results, expected }) => {
    expect(standingsFromResults(teamIds, results, FIVB_POINTS)).toEqual(expected);
  });

  it('gives 0 points for a result missing from the points system', () => {
    const rows = standingsFromResults(['a', 'b'], [result('a', 3, 0, 'b')], { '3-1': 3 });
    expect(rows.map((r) => r.points)).toEqual([0, 0]);
  });

  it.each([
    { name: 'a team listed twice', teamIds: ['a', 'a'], results: [] },
    { name: 'negative sets', teamIds: ['a', 'b'], results: [result('a', -1, 3, 'b')] },
    { name: 'fractional sets', teamIds: ['a', 'b'], results: [result('a', 2.5, 3, 'b')] },
  ])('throws on $name', ({ teamIds, results }) => {
    expect(() => standingsFromResults(teamIds, results, FIVB_POINTS)).toThrow();
  });
});

describe('compareTeamNames', () => {
  const names = { a: 'Zaria Spikers', b: 'Abuja Stars', c: 'abuja stars' };
  it.each([
    ['b', 'a', -1],
    ['a', 'b', 1],
    ['a', 'a', 0],
    ['missing', 'a', -1],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(Math.sign(compareTeamNames(a, b, names))).toBe(expected);
  });
});

describe('defaultStandingsOrder', () => {
  const names: Record<string, string> = {
    t1: 'Delta Spikers',
    t2: 'Calabar Waves',
    t3: 'Benue Rockets',
    t4: 'Abuja Stars',
  };

  it.each<{ name: string; rows: StandingsRow[]; expected: string[] }>([
    {
      name: 'most points first',
      rows: [row('t1', 1, 3, 6), row('t2', 5, 6, 2), row('t3', 3, 3, 4), row('t4', 0, 0, 0)],
      expected: ['t2', 't3', 't1', 't4'],
    },
    {
      name: 'then the better set ratio',
      rows: [row('t1', 6, 7, 4), row('t2', 6, 6, 3)],
      expected: ['t2', 't1'],
    },
    {
      name: 'no sets lost beats any finite ratio',
      rows: [row('t1', 6, 6, 1), row('t2', 6, 3, 0)],
      expected: ['t2', 't1'],
    },
    {
      name: 'then more sets won on an equal ratio',
      rows: [row('t1', 6, 4, 2), row('t2', 6, 6, 3)],
      expected: ['t2', 't1'],
    },
    {
      name: 'then more sets won when both lost none',
      rows: [row('t1', 6, 3, 0), row('t2', 6, 6, 0)],
      expected: ['t2', 't1'],
    },
    {
      name: 'then team name',
      rows: [row('t1', 3, 3, 1), row('t3', 3, 3, 1), row('t4', 3, 3, 1)],
      expected: ['t4', 't3', 't1'],
    },
    {
      name: '0/0 ties with 0/3 on ratio, then names decide',
      rows: [row('t1', 0, 0, 3), row('t2', 0, 0, 0)],
      expected: ['t2', 't1'],
    },
    {
      name: 'then id when names are missing or equal',
      rows: [row('z9', 0, 0, 0), row('z1', 0, 0, 0)],
      expected: ['z1', 'z9'],
    },
  ])('$name', ({ rows, expected }) => {
    expect(defaultStandingsOrder(rows, names)).toEqual(expected);
    expect(defaultStandingsOrder([...rows].reverse(), names)).toEqual(expected);
  });
});
