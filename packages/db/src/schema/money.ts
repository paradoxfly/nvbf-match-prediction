import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
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
import { matchDays } from './contest';
import { bankPayments, entries } from './entries';
import {
  actorType,
  contributionSource,
  contributionStatus,
  obligationKind,
  obligationStatus,
  payoutAttemptStatus,
} from './enums';
import { adminUsers, users } from './identity';
import { jackpots } from './league';
import { mediaAssets } from './media';

/**
 * Extra prize money for one day or for the jackpot: a sponsor's money, an operator top-up, or a
 * jackpot carried over from a previous league. Only `allocated` money counts toward a pool.
 */
export const prizeContributions = pgTable(
  'prize_contributions',
  {
    id: id(),
    source: contributionSource().notNull(),
    status: contributionStatus().notNull().default('pledged'),
    matchDayId: uuid().references(() => matchDays.id, { onDelete: 'restrict' }),
    jackpotId: uuid().references(() => jackpots.id, { onDelete: 'restrict' }),
    amountKobo: kobo().notNull(),
    sponsorName: text(),
    sponsorLogoMediaId: uuid().references(() => mediaAssets.id, { onDelete: 'set null' }),
    sponsorUrl: text(),
    note: text(),
    receivedAt: tstz(),
    allocatedAt: tstz(),
    returnedAt: tstz(),
    createdByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [
    index().on(t.matchDayId),
    index().on(t.jackpotId),
    check(
      'prize_contributions_one_target',
      sql`(${t.matchDayId} is null) <> (${t.jackpotId} is null)`,
    ),
    check('prize_contributions_amount_positive', sql`${t.amountKobo} > 0`),
  ],
);

/** The final leaderboard, written when a day is finalized (superseded, never edited, on reopen). */
export const leaderboardRows = pgTable(
  'leaderboard_rows',
  {
    id: id(),
    matchDayId: uuid()
      .notNull()
      .references(() => matchDays.id, { onDelete: 'restrict' }),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    displayName: text().notNull(),
    points: integer().notNull(),
    closeness: integer().notNull(),
    exactCount: integer().notNull(),
    winnerCount: integer().notNull(),
    countedPredictions: integer().notNull(),
    rank: integer().notNull(),
    groupSize: integer().notNull(),
    prizeKobo: kobo().notNull().default(0),
    finalizeVersion: integer().notNull(),
    supersededAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('leaderboard_rows_current')
      .on(t.matchDayId, t.entryId)
      .where(sql`${t.supersededAt} is null`),
    index().on(t.matchDayId, t.rank),
  ],
);

/**
 * Where a player wants winnings and refunds paid. A change only takes effect after
 * `activeFrom` (24 hours later) and the player is texted, which blunts SIM-swap fraud.
 */
export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    bankCode: text().notNull(),
    bankName: text().notNull(),
    /** AES-256-GCM ciphertext of the 10-digit NUBAN; decrypted for finance only. */
    accountNumberEnc: text().notNull(),
    encKeyId: text().notNull(),
    last4: text().notNull(),
    /** HMAC of bank + account number: spots one account shared by several players. */
    fingerprint: text().notNull(),
    accountName: text().notNull(),
    activeFrom: tstz().notNull(),
    cancelledAt: tstz(),
    ...timestamps,
  },
  (t) => [index().on(t.userId, t.activeFrom), index().on(t.fingerprint)],
);

/** Money we owe someone: a daily prize, the jackpot, or a refund. */
export const payoutObligations = pgTable(
  'payout_obligations',
  {
    id: id(),
    kind: obligationKind().notNull(),
    status: obligationStatus().notNull(),
    /** Null for refunds of transfers we couldn't tie to a player (paid back to the sender). */
    userId: uuid().references(() => users.id, { onDelete: 'restrict' }),
    matchDayId: uuid().references(() => matchDays.id, { onDelete: 'restrict' }),
    entryId: uuid().references(() => entries.id, { onDelete: 'restrict' }),
    bankPaymentId: uuid().references(() => bankPayments.id, { onDelete: 'restrict' }),
    jackpotId: uuid().references(() => jackpots.id, { onDelete: 'restrict' }),
    rank: integer(),
    amountKobo: kobo().notNull(),
    reason: text(),
    statusNote: text(),
    /** Set when a reopened day replaces its obligations (only possible before any payout). */
    supersededAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('payout_obligations_entry_kind')
      .on(t.entryId, t.kind)
      .where(sql`${t.entryId} is not null and ${t.supersededAt} is null`),
    uniqueIndex('payout_obligations_jackpot')
      .on(t.jackpotId)
      .where(sql`${t.kind} = 'jackpot' and ${t.supersededAt} is null`),
    index().on(t.status),
    index().on(t.userId),
    index().on(t.matchDayId),
    check('payout_obligations_amount_positive', sql`${t.amountKobo} > 0`),
  ],
);

/** One attempt to pay an obligation. At most one live (pending or paid) attempt per obligation. */
export const payoutAttempts = pgTable(
  'payout_attempts',
  {
    id: id(),
    obligationId: uuid()
      .notNull()
      .references(() => payoutObligations.id, { onDelete: 'restrict' }),
    status: payoutAttemptStatus().notNull().default('pending'),
    amountKobo: kobo().notNull(),
    /** Copy of the destination at the time, so later account changes can't rewrite history. */
    accountSnapshot: jsonb().$type<{
      payoutAccountId: string | null;
      bankName: string;
      bankCode: string | null;
      last4: string;
      accountName: string;
    }>(),
    nameEnquiryName: text(),
    transferReference: text(),
    failureReason: text(),
    startedByAdminId: uuid()
      .notNull()
      .references(() => adminUsers.id),
    completedByAdminId: uuid().references(() => adminUsers.id),
    startedAt: tstz().notNull().defaultNow(),
    completedAt: tstz(),
  },
  (t) => [
    uniqueIndex('payout_attempts_one_live')
      .on(t.obligationId)
      .where(sql`${t.status} in ('pending', 'paid')`),
    uniqueIndex('payout_attempts_reference')
      .on(t.transferReference)
      .where(sql`${t.transferReference} is not null`),
  ],
);

/**
 * Append-only money journal. Each business event writes one row per affected account with a
 * signed amount; (eventKey, account) is unique, so replaying an event can never double count.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: id(),
    eventKey: text().notNull(),
    account: text().notNull(),
    amountKobo: bigint({ mode: 'number' }).notNull(),
    matchDayId: uuid().references(() => matchDays.id, { onDelete: 'restrict' }),
    jackpotId: uuid().references(() => jackpots.id, { onDelete: 'restrict' }),
    refType: text(),
    refId: uuid(),
    memo: text(),
    actorType: actorType().notNull(),
    actorId: uuid(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.eventKey, t.account),
    index().on(t.matchDayId),
    index().on(t.jackpotId),
    index().on(t.account),
  ],
);
