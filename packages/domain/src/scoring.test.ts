import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING, maxPointsPerMatch, scoreEntry, scoreMatch } from './scoring';
import type {
  CountedPrediction,
  EntryScore,
  MajorScore,
  MatchOutcome,
  ScoringConfig,
  SetLine,
} from './types';

function s(...sets: string[]): SetLine {
  return sets.map((set) => {
    const [home, away] = set.split('-').map(Number);
    return { home: home ?? Number.NaN, away: away ?? Number.NaN };
  });
}

function m(score: string): MajorScore {
  const [homeSets, awaySets] = score.split('-').map(Number);
  return { homeSets: homeSets ?? Number.NaN, awaySets: awaySets ?? Number.NaN };
}

const LENIENT: ScoringConfig = { ...DEFAULT_SCORING, bonusNeedsWinner: false };
const CUSTOM: ScoringConfig = { winner: 5, setCount: 1, exactScore: 3, bonusNeedsWinner: true };

describe('scoreMatch', () => {
  it.each([
    // The PRD examples.
    { predicted: '3-1', actual: '3-1', cfg: DEFAULT_SCORING, points: 7, winner: true, exact: true },
    {
      predicted: '3-2',
      actual: '3-1',
      cfg: DEFAULT_SCORING,
      points: 3,
      winner: true,
      exact: false,
    },
    {
      predicted: '1-3',
      actual: '3-1',
      cfg: DEFAULT_SCORING,
      points: 0,
      winner: false,
      exact: false,
    },
    { predicted: '1-3', actual: '3-1', cfg: LENIENT, points: 2, winner: false, exact: false },
    // More combinations.
    { predicted: '3-0', actual: '3-0', cfg: DEFAULT_SCORING, points: 7, winner: true, exact: true },
    {
      predicted: '3-0',
      actual: '3-2',
      cfg: DEFAULT_SCORING,
      points: 3,
      winner: true,
      exact: false,
    },
    {
      predicted: '0-3',
      actual: '3-0',
      cfg: DEFAULT_SCORING,
      points: 0,
      winner: false,
      exact: false,
    },
    { predicted: '0-3', actual: '3-0', cfg: LENIENT, points: 2, winner: false, exact: false },
    { predicted: '2-3', actual: '3-1', cfg: LENIENT, points: 0, winner: false, exact: false },
    { predicted: '2-3', actual: '2-3', cfg: DEFAULT_SCORING, points: 7, winner: true, exact: true },
    { predicted: '2-1', actual: '2-1', cfg: DEFAULT_SCORING, points: 7, winner: true, exact: true },
    {
      predicted: '2-0',
      actual: '2-1',
      cfg: DEFAULT_SCORING,
      points: 3,
      winner: true,
      exact: false,
    },
    { predicted: '3-1', actual: '3-1', cfg: CUSTOM, points: 9, winner: true, exact: true },
    { predicted: '3-2', actual: '3-1', cfg: CUSTOM, points: 5, winner: true, exact: false },
  ])(
    '$predicted vs $actual (bonusNeedsWinner=$cfg.bonusNeedsWinner) → $points',
    ({ predicted, actual, cfg, points, winner, exact }) => {
      expect(scoreMatch(m(predicted), m(actual), cfg)).toEqual({
        points,
        correctWinner: winner,
        exactScore: exact,
      });
    },
  );

  it('scores a missing prediction as 0', () => {
    expect(scoreMatch(null, m('3-1'), DEFAULT_SCORING)).toEqual({
      points: 0,
      correctWinner: false,
      exactScore: false,
    });
  });

  it.each([
    { predicted: '2-2', actual: '3-1' },
    { predicted: '3-1', actual: '1-1' },
  ])('throws when $predicted or $actual has no winner', ({ predicted, actual }) => {
    expect(() => scoreMatch(m(predicted), m(actual), DEFAULT_SCORING)).toThrow();
  });
});

describe('maxPointsPerMatch', () => {
  it.each([
    { cfg: DEFAULT_SCORING, expected: 7 },
    { cfg: CUSTOM, expected: 9 },
  ])('$expected', ({ cfg, expected }) => {
    expect(maxPointsPerMatch(cfg)).toBe(expected);
  });
});

describe('scoreEntry', () => {
  const m1Result = s('25-20', '23-25', '25-22', '25-18'); // 3–1, 183 points played
  const m2Result = s('20-25', '22-25', '19-25'); // 0–3
  const m6Result = s('25-20', '20-25', '25-20', '20-25', '15-12'); // 3–2, 207 points played
  const matches: MatchOutcome[] = [
    { matchId: 'm1', status: 'final', result: m1Result },
    { matchId: 'm2', status: 'final', result: m2Result },
    { matchId: 'm3', status: 'void', result: null },
    { matchId: 'm4', status: 'scheduled', result: null },
    { matchId: 'm5', status: 'final', result: null },
    { matchId: 'm6', status: 'final', result: m6Result },
  ];
  const exactM1: CountedPrediction = { matchId: 'm1', sets: s('25-21', '23-25', '25-22', '25-18') };
  const wrongM2: CountedPrediction = { matchId: 'm2', sets: s('25-20', '25-20', '25-20') };
  const ignored: CountedPrediction[] = [
    { matchId: 'm3', sets: s('25-20', '25-20', '25-20') },
    { matchId: 'm4', sets: s('25-20', '25-20', '25-20') },
    { matchId: 'm5', sets: s('25-20', '25-20', '25-20') },
    { matchId: 'unknown', sets: s('25-20', '25-20', '25-20') },
  ];
  // m2 predicted 25–20 ×3 against 20–25, 22–25, 19–25.
  const m2Closeness = 10 + 8 + 11;

  it.each<{
    name: string;
    predictions: CountedPrediction[];
    cfg: ScoringConfig;
    expected: EntryScore;
  }>([
    {
      name: 'no predictions',
      predictions: [],
      cfg: DEFAULT_SCORING,
      expected: {
        points: 0,
        closeness: 183 + 136 + 207,
        exactCount: 0,
        winnerCount: 0,
        scoredMatches: 3,
        countedPredictions: 0,
      },
    },
    {
      name: 'one exact, one wrong winner, one skipped',
      predictions: [exactM1, wrongM2],
      cfg: DEFAULT_SCORING,
      expected: {
        points: 7,
        closeness: 1 + m2Closeness + 207,
        exactCount: 1,
        winnerCount: 1,
        scoredMatches: 3,
        countedPredictions: 2,
      },
    },
    {
      name: 'bonuses without the winner',
      predictions: [exactM1, wrongM2],
      cfg: LENIENT,
      expected: {
        points: 7 + 2,
        closeness: 1 + m2Closeness + 207,
        exactCount: 1,
        winnerCount: 1,
        scoredMatches: 3,
        countedPredictions: 2,
      },
    },
    {
      name: 'void, pending and unknown matches are ignored',
      predictions: [exactM1, ...ignored],
      cfg: DEFAULT_SCORING,
      expected: {
        points: 7,
        closeness: 1 + 136 + 207,
        exactCount: 1,
        winnerCount: 1,
        scoredMatches: 3,
        countedPredictions: 1,
      },
    },
  ])('$name', ({ predictions, cfg, expected }) => {
    expect(scoreEntry(predictions, matches, cfg)).toEqual(expected);
  });

  it('scores nothing when no match is final yet', () => {
    const pending: MatchOutcome[] = [{ matchId: 'm1', status: 'scheduled', result: null }];
    expect(scoreEntry([exactM1], pending, DEFAULT_SCORING)).toEqual({
      points: 0,
      closeness: 0,
      exactCount: 0,
      winnerCount: 0,
      scoredMatches: 0,
      countedPredictions: 0,
    });
  });

  it('throws on two predictions for one match', () => {
    expect(() => scoreEntry([exactM1, exactM1], matches, DEFAULT_SCORING)).toThrow(/m1/);
  });

  it('throws when a match is listed twice', () => {
    const doubled = [...matches, { matchId: 'm1', status: 'final', result: m1Result } as const];
    expect(() => scoreEntry([], doubled, DEFAULT_SCORING)).toThrow(/m1/);
  });
});
