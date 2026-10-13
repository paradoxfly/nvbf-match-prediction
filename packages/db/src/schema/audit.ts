import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './_shared';
import { actorType } from './enums';

/**
 * Append-only record of every admin mutation and notable system action, written inside the
 * same transaction as the change. A trigger (see the `append_only` migration) blocks edits.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorType: actorType().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    reason: text(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    ipHash: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.targetType, t.targetId), index().on(t.createdAt), index().on(t.actorId)],
);
