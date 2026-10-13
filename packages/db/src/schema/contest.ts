import type { CollectionAccount, MatchFormat, ScoringConfig, TieBreaker } from '@predict/contracts';
import type { SetLine } from '@predict/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, kobo, timestamps, tstz } from './_shared';
import { category, dayStatus, matchStatus, resultStatus } from './enums';
import { adminUsers } from './identity';
import { leagues, teams } from './league';

/**
 * One daily contest. The config columns can change until the day opens; a trigger (see the
 * `frozen_config` migration) rejects any later change. Totals are frozen at finalization.
 */
export const matchDays = pgTable(
  'match_days',
  {
    id: id(),
    leagueId: uuid()
      .notNull()
      .references(() => leagues.id, { onDelete: 'restrict' }),
    /** The contest's calendar date in Lagos time. */
    date: date({ mode: 'string' }).notNull(),
    title: text(),
    status: dayStatus().notNull().default('draft'),

    entryFeeKobo: kobo().notNull(),
    prizeBps: integer().notNull(),
    jackpotBps: integer().notNull(),
    prizeTiersBps: integer().array().notNull(),
    scoring: jsonb().$type<ScoringConfig>().notNull(),
    format: jsonb().$type<MatchFormat>().notNull(),
    tieBreakers: text().array().$type<TieBreaker[]>().notNull(),
    lockLeadMin: integer().notNull().default(0),
    /** Null until open, when it defaults to half the day's matches (rounded up). */
    minScoredMatches: integer(),

    opensAt: tstz(),
    submissionsCloseAt: tstz(),
    openedAt: tstz(),
    openedByAdminId: uuid().references(() => adminUsers.id),
    closedAt: tstz(),
    closedByAdminId: uuid().references(() => adminUsers.id),

    configHash: text(),
    rulesSnapshot: jsonb(),
    rulesHash: text(),
    collectionAccount: jsonb().$type<CollectionAccount>(),
    /** Bumped whenever anything that changes the leaderboard is committed (cache key). */
    scoringRev: integer().notNull().default(0),

    finalConfirmedCount: integer(),
    finalRevenueKobo: kobo(),
    finalParticipantShareKobo: kobo(),
    finalJackpotCutKobo: kobo(),
    finalContributionsKobo: kobo(),
    finalDailyPoolKobo: kobo(),
    finalOperationsKobo: kobo(),
    finalRoundingKobo: kobo(),
    finalizedAt: tstz(),
    finalizedByAdminId: uuid().references(() => adminUsers.id),
    /** Increments on each finalize, so a reopen + re-finalize gets fresh ledger event keys. */
    finalizeVersion: integer().notNull().default(0),

    cancelledAt: tstz(),
    cancelReason: text(),
    cancelledByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [
    unique().on(t.leagueId, t.date),
    index().on(t.status),
    check('match_days_fee_positive', sql`${t.entryFeeKobo} > 0`),
    check('match_days_prize_bps', sql`${t.prizeBps} between 0 and 10000`),
    check('match_days_jackpot_bps', sql`${t.jackpotBps} between 0 and 10000`),
    check('match_days_lock_lead', sql`${t.lockLeadMin} >= 0`),
  ],
);

export const matches = pgTable(
  'matches',
  {
    id: id(),
    matchDayId: uuid()
      .notNull()
      .references(() => matchDays.id, { onDelete: 'cascade' }),
    homeTeamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    awayTeamId: uuid()
      .notNull()
      .references(() => teams.id, { onDelete: 'restrict' }),
    category: category().notNull(),
    scheduledAt: tstz().notNull(),
    /** Set when staff mark the match as started earlier than scheduled. */
    actualStartAt: tstz(),
    /** Set when a match is rescheduled after its lock had passed, so the lock never reopens. */
    lockedAt: tstz(),
    status: matchStatus().notNull().default('scheduled'),
    voidReason: text(),
    venue: text(),
    displayOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index().on(t.matchDayId),
    check('matches_distinct_teams', sql`${t.homeTeamId} <> ${t.awayTeamId}`),
  ],
);

/** Every version of a match result. At most one is confirmed at a time. */
export const matchResults = pgTable(
  'match_results',
  {
    id: id(),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    sets: jsonb().$type<SetLine>().notNull(),
    homeSets: integer().notNull(),
    awaySets: integer().notNull(),
    status: resultStatus().notNull().default('provisional'),
    nonStandardReason: text(),
    note: text(),
    enteredByAdminId: uuid()
      .notNull()
      .references(() => adminUsers.id),
    confirmedByAdminId: uuid().references(() => adminUsers.id),
    confirmedAt: tstz(),
    supersededAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.matchId, t.version),
    uniqueIndex('match_results_one_confirmed')
      .on(t.matchId)
      .where(sql`${t.status} = 'confirmed'`),
  ],
);
