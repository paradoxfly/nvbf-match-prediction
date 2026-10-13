import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, id, timestamps, tstz } from './_shared';
import { adminRole, adminStatus, userStatus } from './enums';

/** A player. The verified phone number is the account identifier; there is no password. */
export const users = pgTable('users', {
  id: id(),
  /** E.164, e.g. +2348031234567. Never shown publicly. */
  phone: text().notNull().unique(),
  displayName: citext().notNull().unique(),
  status: userStatus().notNull().default('active'),
  statusReason: text(),
  termsVersion: text().notNull(),
  termsAcceptedAt: tstz().notNull(),
  adultConfirmedAt: tstz().notNull(),
  lastLoginAt: tstz(),
  ...timestamps,
});

/** Staff accounts. No public signup: created with the `admin:create` script. */
export const adminUsers = pgTable('admin_users', {
  id: id(),
  email: citext().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  role: adminRole().notNull().default('operations'),
  status: adminStatus().notNull().default('active'),
  /** Encrypted TOTP secret. Present but unused until `totpEnabledAt` is set (setup pending). */
  totpSecretEnc: text(),
  totpEnabledAt: tstz(),
  /** Last accepted TOTP time step, so a code can't be replayed. */
  totpLastStep: integer(),
  lastLoginAt: tstz(),
  ...timestamps,
});

/**
 * One row per refresh token. Rotation creates a new row in the same family and marks the old
 * one replaced; presenting a replaced token is treated as theft and revokes the whole family.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    adminUserId: uuid().references(() => adminUsers.id, { onDelete: 'cascade' }),
    familyId: uuid().notNull(),
    refreshTokenHash: text().notNull().unique(),
    replacedById: uuid(),
    userAgent: text(),
    ipHash: text(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    lastUsedAt: tstz().notNull().defaultNow(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId),
    index().on(t.adminUserId),
    index().on(t.familyId),
    check('sessions_single_subject', sql`(${t.userId} is null) <> (${t.adminUserId} is null)`),
  ],
);

/**
 * SMS sign-in codes, keyed by phone (the account may not exist yet). Only an HMAC of the code is
 * stored; a code dies after expiry, use, or 5 wrong tries.
 */
export const phoneOtps = pgTable(
  'phone_otps',
  {
    id: id(),
    phone: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: tstz().notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: tstz(),
    ipHash: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index().on(t.phone, t.createdAt)],
);
