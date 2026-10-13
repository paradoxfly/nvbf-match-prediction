import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam, IsoDate, Kobo, Reason } from '../common';
import { ResultStatus } from '../enums';
import { AdminDayView } from './setup';
import { SetScoreView } from '../views';

// Results, the leaderboard, and closing out a day (finalize / reopen / cancel).

export const LeaderboardRow = z.object({
  rank: z.number().int(),
  /** True when this player shares the rank with others. */
  tied: z.boolean(),
  displayName: z.string(),
  points: z.number().int(),
  /** Total set-score difference (lower is better): the first tie-breaker. */
  closeness: z.number().int(),
  exactCount: z.number().int(),
  winnerCount: z.number().int(),
  /** Prize so far (provisional until final); null when outside the paid places. */
  prizeKobo: Kobo.nullable(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const LeaderboardView = z.object({
  date: z.string(),
  final: z.boolean(),
  scoredMatches: z.number().int(),
  totalMatches: z.number().int(),
  totalPlayers: z.number().int(),
  rows: z.array(LeaderboardRow),
  updatedAt: z.date(),
});
export type LeaderboardView = z.infer<typeof LeaderboardView>;

export const MyStanding = z.object({
  /** Null when the entry isn't ranked (not confirmed, no counted picks, or disqualified). */
  row: LeaderboardRow.nullable(),
  reason: z.string().nullable(),
});
export type MyStanding = z.infer<typeof MyStanding>;

export const leaderboardContract = {
  day: oc
    .route({ method: 'GET', path: '/public/days/{date}/leaderboard', tags: ['leaderboard'] })
    .input(z.object({ date: IsoDate, limit: z.coerce.number().int().min(1).max(500).default(100) }))
    .output(LeaderboardView),

  mine: oc
    .route({ method: 'GET', path: '/me/days/{date}/standing', tags: ['leaderboard'] })
    .input(z.object({ date: IsoDate }))
    .output(MyStanding),
};

// ---------------------------------------------------------------------------------------------
// Staff: results

export const ResultVersionView = z.object({
  id: z.uuid(),
  version: z.number().int(),
  sets: z.array(SetScoreView),
  homeSets: z.number().int(),
  awaySets: z.number().int(),
  status: ResultStatus,
  nonStandardReason: z.string().nullable(),
  note: z.string().nullable(),
  enteredBy: z.string(),
  confirmedBy: z.string().nullable(),
  createdAt: z.date(),
  confirmedAt: z.date().nullable(),
});
export type ResultVersionView = z.infer<typeof ResultVersionView>;

export const EnterResultInput = IdParam.extend({
  sets: z.array(SetScoreView).min(1).max(5),
  /** Required to accept a score that breaks the normal set rules (e.g. a forfeit 25–0). */
  nonStandardReason: z.string().trim().max(300).optional(),
  note: z.string().trim().max(300).optional(),
  /** Required when replacing a result that was already confirmed (super admins). */
  correctionReason: Reason.optional(),
});
export type EnterResultInput = z.infer<typeof EnterResultInput>;

export const FinalizeCheck = z.object({
  canFinalize: z.boolean(),
  blockers: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const AdminLeaderboardRow = LeaderboardRow.extend({
  entryId: z.uuid(),
  userId: z.uuid(),
  countedPredictions: z.number().int(),
});

export const AdminLeaderboard = z.object({
  day: AdminDayView,
  rows: z.array(AdminLeaderboardRow),
  /** Confirmed entries that aren't ranked, and why. */
  unranked: z.array(z.object({ entryId: z.uuid(), displayName: z.string(), reason: z.string() })),
  check: FinalizeCheck,
  allocation: z.object({
    dailyPoolKobo: Kobo,
    awardedKobo: Kobo,
    roundingKobo: Kobo,
    jackpotCutKobo: Kobo,
  }),
});
export type AdminLeaderboard = z.infer<typeof AdminLeaderboard>;

const RESULT_ERRORS = {
  BAD_STATUS: { status: 409, message: 'The day or match is not in the right state for that.' },
  INVALID_RESULT: {
    status: 400,
    message: 'That is not a valid result.',
    data: z.object({ issues: z.array(z.string()) }),
  },
  CORRECTION_NEEDS_REASON: {
    status: 400,
    message: 'This result was already confirmed: give a reason for the correction.',
  },
  NOTHING_TO_CONFIRM: { status: 409, message: 'There is no entered result to confirm.' },
} as const;

const DAY_CLOSE_ERRORS = {
  BAD_STATUS: { status: 409, message: 'The day is not in the right state for that.' },
  NOT_READY: {
    status: 409,
    message: 'The day cannot be finalized yet.',
    data: z.object({ blockers: z.array(z.string()) }),
  },
  PAYOUTS_STARTED: {
    status: 409,
    message: 'A payout has already started for this day, so it can no longer be reopened.',
  },
} as const;

export const adminResultsContract = {
  versions: oc
    .route({ method: 'GET', path: '/admin/matches/{id}/results', tags: ['admin-results'] })
    .input(IdParam)
    .output(z.object({ items: z.array(ResultVersionView) })),

  /** Enters (or corrects) a result. It only affects the leaderboard once confirmed. */
  enter: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/results', tags: ['admin-results'] })
    .errors(RESULT_ERRORS)
    .input(EnterResultInput)
    .output(AdminDayView),

  confirm: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/results/confirm', tags: ['admin-results'] })
    .errors(RESULT_ERRORS)
    .input(IdParam)
    .output(AdminDayView),

  leaderboard: oc
    .route({ method: 'GET', path: '/admin/days/{id}/leaderboard', tags: ['admin-results'] })
    .input(IdParam)
    .output(AdminLeaderboard),

  /** Freezes the pool, writes prizes and the jackpot share (super admins). */
  finalize: oc
    .route({ method: 'POST', path: '/admin/days/{id}/finalize', tags: ['admin-results'] })
    .errors(DAY_CLOSE_ERRORS)
    .input(IdParam.extend({ acknowledgeWarnings: z.boolean().default(false) }))
    .output(AdminLeaderboard),

  /** Undoes a finalization before any payout has started (super admins). */
  reopen: oc
    .route({ method: 'POST', path: '/admin/days/{id}/reopen', tags: ['admin-results'] })
    .errors(DAY_CLOSE_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminLeaderboard),

  /** Cancels the day: every confirmed entry is refunded in full (super admins). */
  cancel: oc
    .route({ method: 'POST', path: '/admin/days/{id}/cancel', tags: ['admin-results'] })
    .errors(DAY_CLOSE_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminDayView),
};
