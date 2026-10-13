import type { CollectionAccount, DayConfig } from '@predict/contracts';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, id, timestamps, tstz } from './_shared';
import { emailPurpose, emailStatus } from './enums';
import { adminUsers, users } from './identity';

/** What a notification email says. The provider's one message template lays it out. */
export interface EmailContent {
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}

/**
 * Every email: sign-in codes (never with the code stored) and notifications. Doubles as the
 * outbox for notifications and as the durable source for per-address code limits.
 */
export const emailMessages = pgTable(
  'email_messages',
  {
    id: id(),
    toEmail: citext().notNull(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    purpose: emailPurpose().notNull(),
    subject: text().notNull(),
    /** Null for sign-in codes: they are never stored. */
    content: jsonb().$type<EmailContent>(),
    provider: text().notNull(),
    providerMessageId: text(),
    status: emailStatus().notNull().default('queued'),
    error: text(),
    attempts: integer().notNull().default(0),
    ipHash: text(),
    sendAfter: tstz().notNull().defaultNow(),
    sentAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.toEmail, t.createdAt),
    index().on(t.status, t.sendAfter),
    index().on(t.createdAt),
  ],
);

/** Single-row app settings (id is always 1). */
export const settings = pgTable(
  'settings',
  {
    id: integer().primaryKey().default(1),
    /** Where players send entry fees. Only super admins can change it, and every change is audited. */
    collectionAccount: jsonb().$type<CollectionAccount>(),
    /** Defaults for new leagues. */
    defaultDayConfig: jsonb().$type<DayConfig>().notNull(),
    /** Email players when their payment is confirmed. */
    emailOnPaymentConfirmed: boolean().notNull().default(false),
    supportContact: text(),
    updatedByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);
