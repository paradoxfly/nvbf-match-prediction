import type { DayConfig, StandingsPointsSystem } from '@predict/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, id, kobo, timestamps, tstz } from './_shared';
import { category, jackpotStatus, leagueStatus } from './enums';
import { adminUsers } from './identity';
import { mediaAssets } from './media';

/** A club side in one category. Created once (with its logo) and reused across leagues. */
export const teams = pgTable(
  'teams',
  {
    id: id(),
    name: citext().notNull(),
    /** Short label for tight spaces and CSV matching, e.g. "KPV". */
    shortName: citext().notNull(),
    category: category().notNull(),
    logoMediaId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    archivedAt: tstz(),
    ...timestamps,
  },
  (t) => [unique().on(t.category, t.name), unique().on(t.category, t.shortName)],
);

/** One competition run: about two weeks of match-days plus the jackpot and the standings. */
export const leagues = pgTable(
  'leagues',
  {
    id: id(),
    name: text().notNull(),
    status: leagueStatus().notNull().default('draft'),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }).notNull(),
    /** Copied onto each new match-day; each day can still be adjusted until it opens. */
    defaults: jsonb().$type<DayConfig>().notNull(),
    standingsPublic: boolean().notNull().default(false),
    standingsPointsSystem: jsonb().$type<StandingsPointsSystem>().notNull(),
    standingsUpdatedAt: tstz(),
    standingsFinalizedAt: tstz(),
    standingsFinalizedByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [check('leagues_dates', sql`${t.endDate} >= ${t.startDate}`)],
);

/** A team taking part in a league, with its admin-maintained standings row. */
export const leagueTeams = pgTable(
  'league_teams',
  {
    id: id(),
    leagueId: uuid()
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    teamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    category: category().notNull(),
    played: integer().notNull().default(0),
    lost: integer().notNull().default(0),
    setsWon: integer().notNull().default(0),
    setsLost: integer().notNull().default(0),
    points: integer().notNull().default(0),
    /** Table position within the category (1 = top), set by staff. */
    position: integer(),
    /** A withdrawn team is left out of the final table (and out of jackpot scoring). */
    withdrawnAt: tstz(),
    updatedByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [
    unique().on(t.leagueId, t.teamId),
    index().on(t.leagueId, t.category),
    check(
      'league_teams_non_negative',
      sql`${t.played} >= 0 and ${t.lost} >= 0 and ${t.lost} <= ${t.played} and ${t.setsWon} >= 0 and ${t.setsLost} >= 0 and ${t.points} >= 0`,
    ),
  ],
);

/** The league jackpot: grows from each finalized day and goes to the best standings prediction. */
export const jackpots = pgTable('jackpots', {
  id: id(),
  leagueId: uuid()
    .notNull()
    .unique()
    .references(() => leagues.id, { onDelete: 'restrict' }),
  status: jackpotStatus().notNull().default('open'),
  /** Predictions can be saved until this moment (moved later only, never earlier, once used). */
  entryClosesAt: tstz().notNull(),
  finalAmountKobo: kobo(),
  winnerJackpotEntryId: uuid(),
  winnerDistance: integer(),
  rulesSnapshot: jsonb(),
  settledAt: tstz(),
  settledByAdminId: uuid().references(() => adminUsers.id),
  ...timestamps,
});
