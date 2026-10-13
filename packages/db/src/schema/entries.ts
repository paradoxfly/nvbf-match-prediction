import type { SetLine, StandingsOrders } from '@predict/domain';
import { sql } from 'drizzle-orm';
import {
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
import { matchDays, matches } from './contest';
import { claimStatus, entryStatus } from './enums';
import { adminUsers, users } from './identity';
import { jackpots } from './league';

/**
 * Money that actually arrived in the collection account, recorded by finance from the bank
 * statement. One transfer can pay for several entries (or carry a refund), but never more than
 * its amount: Σ fees applied + Σ refunds ≤ amount, checked with the row locked.
 */
export const bankPayments = pgTable(
  'bank_payments',
  {
    id: id(),
    /** Normalised bank/NIP session reference. Null only for cash deposits (note required). */
    bankReference: text(),
    amountKobo: kobo().notNull(),
    /** When the money reached the account, per the bank statement. */
    creditedAt: tstz().notNull(),
    senderName: text(),
    narration: text(),
    note: text(),
    recordedByAdminId: uuid()
      .notNull()
      .references(() => adminUsers.id),
    voidedAt: tstz(),
    voidReason: text(),
    voidedByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('bank_payments_reference_key')
      .on(t.bankReference)
      .where(sql`${t.bankReference} is not null`),
    index().on(t.creditedAt),
    check('bank_payments_amount_positive', sql`${t.amountKobo} > 0`),
    check('bank_payments_cash_note', sql`${t.bankReference} is not null or ${t.note} is not null`),
  ],
);

/** One player's entry into one day. Picks only count once the entry is confirmed. */
export const entries = pgTable(
  'entries',
  {
    id: id(),
    matchDayId: uuid()
      .notNull()
      .references(() => matchDays.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: entryStatus().notNull().default('awaiting_payment'),
    /** What the player writes in the transfer narration. */
    paymentReference: text().notNull().unique(),
    feeKobo: kobo().notNull(),
    /** Hash of the rules the player saw when they joined. */
    rulesHash: text().notNull(),
    bankPaymentId: uuid().references(() => bankPayments.id),
    /** Copied from the bank payment: predictions count only for matches locking after this. */
    creditedAt: tstz(),
    confirmedAt: tstz(),
    confirmedByAdminId: uuid().references(() => adminUsers.id),
    disqualifiedAt: tstz(),
    disqualifiedReason: text(),
    disqualifiedByAdminId: uuid().references(() => adminUsers.id),
    refundedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    unique().on(t.matchDayId, t.userId),
    index().on(t.matchDayId, t.status),
    index().on(t.bankPaymentId),
    index().on(t.userId),
    check(
      'entries_confirmed_has_payment',
      sql`${t.status} <> 'confirmed' or (${t.bankPaymentId} is not null and ${t.creditedAt} is not null)`,
    ),
  ],
);

/** A player's "I've paid" note, which finance uses to find the transfer on the statement. */
export const paymentClaims = pgTable(
  'payment_claims',
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    senderName: text().notNull(),
    senderBank: text(),
    amountKobo: kobo().notNull(),
    paidAt: tstz().notNull(),
    transferReference: text(),
    status: claimStatus().notNull().default('pending'),
    reviewedByAdminId: uuid().references(() => adminUsers.id),
    reviewedAt: tstz(),
    reviewNote: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index().on(t.entryId), index().on(t.status, t.createdAt)],
);

/** The latest pick per entry and match. History lives in `prediction_revisions`. */
export const predictions = pgTable(
  'predictions',
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    homeSets: integer().notNull(),
    awaySets: integer().notNull(),
    sets: jsonb().$type<SetLine>().notNull(),
    savedAt: tstz().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [unique().on(t.entryId, t.matchId)],
);

/**
 * Every saved version of every pick (append-only). Scoring reads the latest revision saved
 * before each match's lock, so a save that races a lock can never count.
 */
export const predictionRevisions = pgTable(
  'prediction_revisions',
  {
    id: id(),
    entryId: uuid()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    homeSets: integer().notNull(),
    awaySets: integer().notNull(),
    sets: jsonb().$type<SetLine>().notNull(),
    savedAt: tstz().notNull(),
  },
  (t) => [index().on(t.entryId, t.matchId, t.savedAt)],
);

/** A player's predicted final tables for the league jackpot. */
export const jackpotEntries = pgTable(
  'jackpot_entries',
  {
    id: id(),
    jackpotId: uuid()
      .notNull()
      .references(() => jackpots.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orders: jsonb().$type<StandingsOrders>().notNull(),
    /** When it was submitted. Entries can't be changed afterwards (DB trigger); earlier wins ties. */
    submittedAt: tstz().notNull(),
    rulesHash: text().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.jackpotId, t.userId)],
);

export type EntryRow = typeof entries.$inferSelect;
export type BankPaymentRow = typeof bankPayments.$inferSelect;
