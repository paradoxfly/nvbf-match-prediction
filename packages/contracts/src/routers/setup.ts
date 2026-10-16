import { oc } from '@orpc/contract';
import { z } from 'zod';
import { ClockTime, IdParam, IsoDate, Reason, QueryFlag } from '../common';
import { CollectionAccount, DayConfig, StandingsPointsSystem } from '../config';
import { Category, DayStatus, JackpotStatus, LeagueStatus } from '../enums';
import { DayCard, MatchView, PoolView, TeamRef } from '../views';

// Staff setup: teams (with logos), leagues, match-days, fixtures and app settings.

const TeamName = z.string().trim().min(2).max(60);
const ShortName = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .regex(/^[A-Za-z0-9.&' -]+$/, { error: 'Letters and numbers only.' });

export const TeamView = TeamRef.extend({ archived: z.boolean() });
export type TeamView = z.infer<typeof TeamView>;

export const CreateTeamInput = z.object({
  name: TeamName,
  shortName: ShortName,
  category: Category,
  logoMediaId: z.uuid().nullable().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

export const UpdateTeamInput = IdParam.extend({
  name: TeamName.optional(),
  shortName: ShortName.optional(),
  logoMediaId: z.uuid().nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamInput>;

const TEAM_ERRORS = {
  TEAM_EXISTS: {
    status: 409,
    message: 'A team with that name or short name already exists in this category.',
  },
  MEDIA_NOT_READY: { status: 409, message: 'Upload the logo again before saving.' },
} as const;

export const adminTeamsContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/teams', tags: ['admin-teams'] })
    .input(z.object({ category: Category.optional(), includeArchived: QueryFlag.optional() }))
    .output(z.object({ items: z.array(TeamView) })),

  create: oc
    .route({ method: 'POST', path: '/admin/teams', tags: ['admin-teams'] })
    .errors(TEAM_ERRORS)
    .input(CreateTeamInput)
    .output(TeamView),

  update: oc
    .route({ method: 'PATCH', path: '/admin/teams/{id}', tags: ['admin-teams'] })
    .errors(TEAM_ERRORS)
    .input(UpdateTeamInput)
    .output(TeamView),
};

// ---------------------------------------------------------------------------------------------
// Leagues

export const JackpotSummary = z.object({
  id: z.uuid(),
  status: JackpotStatus,
  entryClosesAt: z.date(),
  entries: z.number().int(),
  guaranteedKobo: z.number().int(),
});

export const LeagueTeamView = z.object({
  team: TeamRef,
  played: z.number().int(),
  lost: z.number().int(),
  setsWon: z.number().int(),
  setsLost: z.number().int(),
  points: z.number().int(),
  position: z.number().int().nullable(),
  withdrawn: z.boolean(),
});
export type LeagueTeamView = z.infer<typeof LeagueTeamView>;

export const LeagueView = z.object({
  id: z.uuid(),
  name: z.string(),
  status: LeagueStatus,
  startDate: z.string(),
  endDate: z.string(),
  defaults: DayConfig,
  standingsPublic: z.boolean(),
  standingsPointsSystem: StandingsPointsSystem,
  standingsUpdatedAt: z.date().nullable(),
  standingsFinalizedAt: z.date().nullable(),
  teams: z.array(LeagueTeamView),
  jackpot: JackpotSummary.nullable(),
  days: z.array(DayCard),
});
export type LeagueView = z.infer<typeof LeagueView>;

export const LeagueListItem = z.object({
  id: z.uuid(),
  name: z.string(),
  status: LeagueStatus,
  startDate: z.string(),
  endDate: z.string(),
  dayCount: z.number().int(),
  teamCount: z.number().int(),
});

export const CreateLeagueInput = z.object({
  name: z.string().trim().min(3).max(80),
  startDate: IsoDate,
  endDate: IsoDate,
  /** Jackpot predictions are accepted until this moment (WAT date + time). */
  jackpotEntryClosesOn: IsoDate,
  jackpotEntryClosesAt: ClockTime,
  defaults: DayConfig.optional(),
});
export type CreateLeagueInput = z.infer<typeof CreateLeagueInput>;

export const UpdateLeagueInput = IdParam.extend({
  name: z.string().trim().min(3).max(80).optional(),
  startDate: IsoDate.optional(),
  endDate: IsoDate.optional(),
  defaults: DayConfig.optional(),
  standingsPublic: z.boolean().optional(),
  standingsPointsSystem: StandingsPointsSystem.optional(),
});
export type UpdateLeagueInput = z.infer<typeof UpdateLeagueInput>;

const LEAGUE_ERRORS = {
  INVALID_DATES: { status: 400, message: 'The end date must be on or after the start date.' },
  LEAGUE_LOCKED: { status: 409, message: 'This can no longer change for this league.' },
  NOT_ENOUGH_TEAMS: {
    status: 409,
    message: 'Add at least two teams in a category before starting the league.',
  },
  JACKPOT_DEADLINE_FIXED: {
    status: 409,
    message: 'Players have already submitted jackpot predictions, so the deadline is fixed.',
  },
  DATE_OUTSIDE_LEAGUE: { status: 400, message: 'Match-days must fall within the league dates.' },
} as const;

export const adminLeaguesContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/leagues', tags: ['admin-leagues'] })
    .output(z.object({ items: z.array(LeagueListItem) })),

  get: oc
    .route({ method: 'GET', path: '/admin/leagues/{id}', tags: ['admin-leagues'] })
    .input(IdParam)
    .output(LeagueView),

  create: oc
    .route({ method: 'POST', path: '/admin/leagues', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(CreateLeagueInput)
    .output(LeagueView),

  update: oc
    .route({ method: 'PATCH', path: '/admin/leagues/{id}', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(UpdateLeagueInput)
    .output(LeagueView),

  setTeams: oc
    .route({ method: 'PUT', path: '/admin/leagues/{id}/teams', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(IdParam.extend({ teamIds: z.array(z.uuid()).max(64) }))
    .output(LeagueView),

  activate: oc
    .route({ method: 'POST', path: '/admin/leagues/{id}/activate', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(IdParam)
    .output(LeagueView),

  setJackpotClose: oc
    .route({ method: 'PUT', path: '/admin/leagues/{id}/jackpot-close', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(IdParam.extend({ date: IsoDate, time: ClockTime }))
    .output(LeagueView),

  /** Creates draft days on the given dates (rest days are simply not picked). */
  createDays: oc
    .route({ method: 'POST', path: '/admin/leagues/{id}/days', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(IdParam.extend({ dates: z.array(IsoDate).min(1).max(60) }))
    .output(z.object({ created: z.number().int(), skipped: z.array(IsoDate) })),

  /**
   * Fixture list as CSV with columns `date,time,category,home,away[,venue]` (a header row is
   * optional; with one, columns can be in any order). Dates are YYYY-MM-DD or DD/MM/YYYY, times
   * 16:00 or 4:00 pm (Lagos). Teams are matched by name or short name within the category.
   * With `commit: false` nothing is written.
   */
  importFixtures: oc
    .route({ method: 'POST', path: '/admin/leagues/{id}/fixtures/import', tags: ['admin-leagues'] })
    .errors(LEAGUE_ERRORS)
    .input(IdParam.extend({ csv: z.string().min(1).max(200_000), commit: z.boolean() }))
    .output(
      z.object({
        rows: z.array(
          z.object({
            line: z.number().int(),
            date: z.string(),
            time: z.string(),
            home: z.string(),
            away: z.string(),
            category: Category.nullable(),
            error: z.string().nullable(),
          }),
        ),
        newDays: z.array(IsoDate),
        valid: z.boolean(),
        committed: z.boolean(),
      }),
    ),
};

// ---------------------------------------------------------------------------------------------
// Match-days

export const AdminDayView = z.object({
  id: z.uuid(),
  leagueId: z.uuid(),
  leagueName: z.string(),
  date: z.string(),
  title: z.string().nullable(),
  status: DayStatus,
  config: DayConfig,
  opensAt: z.date().nullable(),
  submissionsCloseAt: z.date().nullable(),
  openedAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  finalizedAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  cancelReason: z.string().nullable(),
  entryCutoff: z.date().nullable(),
  matches: z.array(MatchView),
  counts: z.object({
    awaitingPayment: z.number().int(),
    paymentReview: z.number().int(),
    confirmed: z.number().int(),
  }),
  pool: PoolView,
  /** Problems that would stop the day from opening (empty = ready). */
  openBlockers: z.array(z.string()),
});
export type AdminDayView = z.infer<typeof AdminDayView>;

export const UpdateDayInput = IdParam.extend({
  title: z.string().trim().max(80).nullable().optional(),
  config: DayConfig.optional(),
  opensAt: z.coerce.date().nullable().optional(),
  submissionsCloseAt: z.coerce.date().nullable().optional(),
});
export type UpdateDayInput = z.infer<typeof UpdateDayInput>;

export const AddMatchInput = IdParam.extend({
  homeTeamId: z.uuid(),
  awayTeamId: z.uuid(),
  time: ClockTime,
  venue: z.string().trim().max(80).optional(),
});
export type AddMatchInput = z.infer<typeof AddMatchInput>;

export const UpdateMatchInput = IdParam.extend({
  time: ClockTime.optional(),
  venue: z.string().trim().max(80).nullable().optional(),
  displayOrder: z.number().int().min(0).max(100).optional(),
});
export type UpdateMatchInput = z.infer<typeof UpdateMatchInput>;

const DAY_ERRORS = {
  DAY_LOCKED: { status: 409, message: 'That can no longer change: the day has opened.' },
  BAD_STATUS: { status: 409, message: 'The day is not in the right state for that.' },
  NOT_READY: {
    status: 409,
    message: 'The day is not ready to open yet.',
    data: z.object({ blockers: z.array(z.string()) }),
  },
  TEAM_MISMATCH: {
    status: 400,
    message: 'Both teams must be different, in the same category and in this league.',
  },
  CLOSE_IN_PAST: { status: 400, message: 'Pick a close time in the future, or close it now.' },
  NOT_REOPENABLE: {
    status: 409,
    message:
      "Picks can only reopen for a match that hasn't started, has no result and whose start time is still ahead. Reschedule it first.",
  },
} as const;

export const adminDaysContract = {
  list: oc
    .route({ method: 'GET', path: '/admin/days', tags: ['admin-days'] })
    .input(z.object({ leagueId: z.uuid().optional(), status: DayStatus.optional() }))
    .output(z.object({ items: z.array(DayCard.extend({ leagueName: z.string() })) })),

  get: oc
    .route({ method: 'GET', path: '/admin/days/{id}', tags: ['admin-days'] })
    .input(IdParam)
    .output(AdminDayView),

  update: oc
    .route({ method: 'PATCH', path: '/admin/days/{id}', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(UpdateDayInput)
    .output(AdminDayView),

  addMatch: oc
    .route({ method: 'POST', path: '/admin/days/{id}/matches', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(AddMatchInput)
    .output(AdminDayView),

  updateMatch: oc
    .route({ method: 'PATCH', path: '/admin/matches/{id}', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(UpdateMatchInput)
    .output(AdminDayView),

  removeMatch: oc
    .route({ method: 'DELETE', path: '/admin/matches/{id}', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam)
    .output(AdminDayView),

  publish: oc
    .route({ method: 'POST', path: '/admin/days/{id}/publish', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam)
    .output(AdminDayView),

  /** Opens entries and freezes the day's settings (super admins only). */
  open: oc
    .route({ method: 'POST', path: '/admin/days/{id}/open', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam)
    .output(AdminDayView),

  /** Closes submissions now. Matches already locked stay locked. */
  close: oc
    .route({ method: 'POST', path: '/admin/days/{id}/close', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam)
    .output(AdminDayView),

  markStarted: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/started', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam.extend({ startedAt: z.coerce.date(), reason: Reason }))
    .output(AdminDayView),

  voidMatch: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/void', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminDayView),

  /** Moves a match within its day. If its lock had already passed, it stays locked. */
  reschedule: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/reschedule', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam.extend({ time: ClockTime, reason: Reason }))
    .output(AdminDayView),

  /**
   * Reopens picks for a match that locked but never started (e.g. postponed to later the same
   * day): it locks again at its new start.
   */
  reopenMatch: oc
    .route({ method: 'POST', path: '/admin/matches/{id}/reopen', tags: ['admin-days'] })
    .errors(DAY_ERRORS)
    .input(IdParam.extend({ reason: Reason }))
    .output(AdminDayView),
};

// ---------------------------------------------------------------------------------------------
// Settings

export const SettingsView = z.object({
  collectionAccount: CollectionAccount.nullable(),
  defaultDayConfig: DayConfig,
  emailOnPaymentConfirmed: z.boolean(),
  supportContact: z.string().nullable(),
});
export type SettingsView = z.infer<typeof SettingsView>;

export const adminSettingsContract = {
  get: oc
    .route({ method: 'GET', path: '/admin/settings', tags: ['admin-settings'] })
    .output(SettingsView),

  update: oc
    .route({ method: 'PATCH', path: '/admin/settings', tags: ['admin-settings'] })
    .input(
      z.object({
        collectionAccount: CollectionAccount.nullable().optional(),
        defaultDayConfig: DayConfig.optional(),
        emailOnPaymentConfirmed: z.boolean().optional(),
        supportContact: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .output(SettingsView),
};
