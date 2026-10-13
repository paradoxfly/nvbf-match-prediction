import type { CollectionAccount, DayConfig } from '@predict/contracts';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared';
import { smsPurpose, smsStatus } from './enums';
import { adminUsers, users } from './identity';

/**
 * Every text message: OTPs (never with the code in `body`) and notifications. Doubles as the
 * outbox for notifications and as the durable source for per-phone OTP limits.
 */
export const smsMessages = pgTable(
  'sms_messages',
  {
    id: id(),
    toPhone: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    purpose: smsPurpose().notNull(),
    /** Null for OTPs: codes are never stored. */
    body: text(),
    provider: text().notNull(),
    providerMessageId: text(),
    status: smsStatus().notNull().default('queued'),
    error: text(),
    attempts: integer().notNull().default(0),
    ipHash: text(),
    sendAfter: tstz().notNull().defaultNow(),
    sentAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.toPhone, t.createdAt),
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
    /** Text players when their payment is confirmed (costs one SMS per entry). */
    smsOnPaymentConfirmed: boolean().notNull().default(false),
    supportContact: text(),
    updatedByAdminId: uuid().references(() => adminUsers.id),
    ...timestamps,
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
);
