import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam } from '../common';
import { Category } from '../enums';
import { LeagueTeamView } from './setup';

// Staff-maintained league tables (one per category). They decide the jackpot at the end.

export const StandingsRowInput = z.object({
  teamId: z.uuid(),
  played: z.number().int().min(0).max(200),
  lost: z.number().int().min(0).max(200),
  setsWon: z.number().int().min(0).max(1000),
  setsLost: z.number().int().min(0).max(1000),
  points: z.number().int().min(0).max(1000),
  withdrawn: z.boolean().default(false),
});
export type StandingsRowInput = z.infer<typeof StandingsRowInput>;

export const AdminStandings = z.object({
  leagueId: z.uuid(),
  updatedAt: z.date().nullable(),
  finalizedAt: z.date().nullable(),
  tables: z.array(z.object({ category: Category, rows: z.array(LeagueTeamView) })),
});
export type AdminStandings = z.infer<typeof AdminStandings>;

const STANDINGS_ERRORS = {
  STANDINGS_FINAL: { status: 409, message: 'The final standings are locked.' },
  BAD_TABLE: {
    status: 400,
    message: 'List every team in the category exactly once, in table order.',
  },
} as const;

const tags = ['admin-standings'];

export const adminStandingsContract = {
  get: oc
    .route({ method: 'GET', path: '/admin/leagues/{id}/standings', tags })
    .input(IdParam)
    .output(AdminStandings),

  /** Replaces one category's table. Rows are in table order (first = top). */
  save: oc
    .route({ method: 'PUT', path: '/admin/leagues/{id}/standings', tags })
    .errors(STANDINGS_ERRORS)
    .input(IdParam.extend({ category: Category, rows: z.array(StandingsRowInput).min(1).max(40) }))
    .output(AdminStandings),

  /** What the table would look like computed from confirmed results (nothing is saved). */
  fromResults: oc
    .route({ method: 'GET', path: '/admin/leagues/{id}/standings/from-results', tags })
    .input(IdParam.extend({ category: Category }))
    .output(z.object({ rows: z.array(StandingsRowInput) })),

  /** Locks both tables as the official final standings (super admins only). */
  finalize: oc
    .route({ method: 'POST', path: '/admin/leagues/{id}/standings/finalize', tags })
    .errors(STANDINGS_ERRORS)
    .input(IdParam)
    .output(AdminStandings),
};
