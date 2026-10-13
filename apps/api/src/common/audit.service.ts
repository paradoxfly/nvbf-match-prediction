import { Inject, Injectable } from '@nestjs/common';
import { auditLogs, type Database, type Executor } from '@predict/db';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { hmac } from './crypto';

export type Actor =
  | { type: 'admin'; id: string; ip?: string }
  | { type: 'user'; id: string; ip?: string }
  | { type: 'system'; id?: null };

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only audit trail. Pass the transaction doing the change so the record commits (or
 * rolls back) with it: a change without its audit row can never exist.
 */
@Injectable()
export class AuditService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async record(executor: Executor | null, actor: Actor, entry: AuditEntry) {
    await (executor ?? this.db).insert(auditLogs).values({
      actorType: actor.type,
      actorId: actor.type === 'system' ? null : actor.id,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      reason: entry.reason ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata,
      ipHash: actor.type !== 'system' && actor.ip ? hmac(this.env.AUTH_SECRET, actor.ip) : null,
    });
  }
}
