// Shared shapes for the contest rules. Everything here is plain data: no I/O, no clocks.
// Money is always an integer number of kobo (₦1 = 100 kobo) and must stay a safe integer.

export type Side = 'home' | 'away';

/** The two competitions in a league. Both share one daily prize pool. */
export type Category = 'men' | 'women';
export const CATEGORIES: readonly Category[] = ['men', 'women'];

/** How a match is played. Sets before the deciding set go to `setTarget`; the deciding set to `decidingSetTarget`. */
export interface MatchFormat {
  /** Best of 3 or 5 sets (first to 2 or 3 sets). */
  bestOf: 3 | 5;
  setTarget: number;
  decidingSetTarget: number;
}

export interface SetScore {
  home: number;
  away: number;
}

/** Every set of a match (or of a prediction), in the order played. */
export type SetLine = SetScore[];

/** The "major" score: sets won by each side, e.g. 3–1. */
export interface MajorScore {
  homeSets: number;
  awaySets: number;
}

export interface SetLineSummary {
  major: MajorScore;
  winner: Side;
  /** Total points across all sets. */
  totals: SetScore;
}

export type SetLineIssueCode =
  | 'NO_SETS'
  | 'TOO_MANY_SETS'
  | 'INVALID_SET_SCORE'
  | 'TIED_SET'
  | 'MATCH_NOT_DECIDED'
  | 'SET_AFTER_MATCH_DECIDED';

export interface SetLineIssue {
  code: SetLineIssueCode;
  /** Zero-based set index the issue refers to, when it is about one set. */
  setIndex?: number;
  message: string;
}

export type SetLineValidation =
  { ok: true; summary: SetLineSummary } | { ok: false; issues: SetLineIssue[] };

/** Points awarded per match. Bonuses can require the winner to be right as well. */
export interface ScoringConfig {
  winner: number;
  setCount: number;
  exactScore: number;
  bonusNeedsWinner: boolean;
}

export interface MatchPoints {
  points: number;
  correctWinner: boolean;
  exactScore: boolean;
}

export type MatchStatus = 'scheduled' | 'final' | 'void';

export type DayStatus =
  'draft' | 'published' | 'open' | 'closed' | 'finalized' | 'completed' | 'cancelled';

/** A match as the scorer sees it. `result` is the confirmed result, if any. */
export interface MatchOutcome {
  matchId: string;
  status: MatchStatus;
  result: SetLine | null;
}

/** A prediction that counts (already filtered by lock time and payment time). */
export interface CountedPrediction {
  matchId: string;
  sets: SetLine;
}

export interface EntryScore {
  points: number;
  /** Sum of absolute point differences, set by set (lower is better). */
  closeness: number;
  exactCount: number;
  winnerCount: number;
  /** Non-void matches that have a confirmed result. */
  scoredMatches: number;
  /** Counted predictions on scored matches. */
  countedPredictions: number;
}

/** Tie-breakers applied, in order, after total points. */
export type TieBreaker = 'closeness' | 'exactScores' | 'correctWinners';

export interface RankInput {
  entryId: string;
  score: EntryScore;
  /** Confirmed, not disqualified and at least one counted prediction. Ineligible rows are dropped. */
  eligible: boolean;
}

export interface RankedEntry {
  entryId: string;
  score: EntryScore;
  /** Competition rank: 1, 2, 2, 4… */
  rank: number;
  /** First and last 1-based position occupied by this entry's tie group. */
  groupStart: number;
  groupEnd: number;
  groupSize: number;
}

export interface PoolInput {
  confirmedCount: number;
  entryFeeKobo: number;
  /** Share of entry revenue that becomes prize money, in basis points (8000 = 80%). */
  prizeBps: number;
  /** Share of that prize money diverted to the league jackpot, in basis points. */
  jackpotBps: number;
  /** Allocated sponsor/operator/rollover money for this day's prizes. */
  contributionsKobo: number;
}

export interface PoolBreakdown {
  revenueKobo: number;
  /** floor(revenue × prizeBps). */
  participantShareKobo: number;
  /** floor(participantShare × jackpotBps). */
  jackpotCutKobo: number;
  contributionsKobo: number;
  /** participantShare − jackpotCut + contributions: what the day's winners share. */
  dailyPoolKobo: number;
  /** revenue − participantShare. */
  operationsKobo: number;
}

export interface Award {
  entryId: string;
  rank: number;
  amountKobo: number;
}

export interface PrizeAllocation {
  awards: Award[];
  /** Kobo left over from splitting tie groups equally (always < group size per group). */
  roundingToOpsKobo: number;
  /** Amount per paid place before ties are applied (length = places actually paid). */
  placeAmountsKobo: number[];
}

/** Timing fields of a day that decide locks. */
export interface DayTiming {
  status: DayStatus;
  closedAt: Date | null;
  submissionsCloseAt: Date | null;
  /** Lock this many minutes before each match's scheduled start (0 = at start). */
  lockLeadMin: number;
}

export interface MatchTiming {
  status: MatchStatus;
  scheduledAt: Date;
  /** Set when an admin marks a match as started early. */
  actualStartAt: Date | null;
  /** Set when a match is rescheduled after its lock had already passed (locks never reopen). */
  lockedAt: Date | null;
}

/** League table points for each possible set result, keyed `${setsWon}-${setsLost}`. */
export type StandingsPointsSystem = Record<string, number>;

export interface TeamResult {
  homeTeamId: string;
  awayTeamId: string;
  homeSets: number;
  awaySets: number;
}

export interface StandingsRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  setsWon: number;
  setsLost: number;
  points: number;
}

/** Team ids in finishing order (index 0 = 1st), per category. */
export type StandingsOrders = Partial<Record<Category, string[]>>;

export interface JackpotCandidate {
  entryId: string;
  orders: StandingsOrders;
  /** When the prediction was submitted (it can't be changed afterwards); earlier wins ties. */
  submittedAt: Date;
  /** Active user with at least one confirmed, non-disqualified daily entry in the league. */
  eligible: boolean;
}

export interface JackpotStanding {
  entryId: string;
  distance: number;
  /** 1-based position after distance, then submittedAt, then entryId. */
  position: number;
}
