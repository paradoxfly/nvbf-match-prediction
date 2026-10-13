import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, ne, sessions, type Database } from '@predict/db';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { hmac, randomToken, sha256 } from '../common/crypto';
import type { IssuedTokens } from './cookies';
import { REFRESH_TOKEN_TTL_SEC, type Realm } from './realm';
import { TokenService } from './token.service';

/** A replaced token presented again within this window is a benign race (two tabs refreshing). */
const REUSE_GRACE_MS = 30_000;

type Executor = Pick<Database, 'select' | 'insert' | 'update'>;

export interface ClientMeta {
  ip: string;
  userAgent: string | null;
}

export interface StartedSession {
  subjectId: string;
  sessionId: string;
  familyId: string;
  tokens: IssuedTokens;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly tokens: TokenService,
  ) {}

  /** Signs a subject in: a new session family with fresh access and refresh tokens. */
  start(realm: Realm, subjectId: string, meta: ClientMeta): Promise<StartedSession> {
    return this.issue(this.db, realm, subjectId, randomUUID(), meta);
  }

  /**
   * Exchanges a refresh token for a new pair. Presenting an already-rotated token (outside the
   * short race window) means it was copied, so the whole family is revoked.
   */
  rotate(realm: Realm, refreshToken: string, meta: ClientMeta): Promise<StartedSession | null> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, sha256(refreshToken)))
        .for('update');
      if (!current) return null;

      const subjectId = realm === 'user' ? current.userId : current.adminUserId;
      if (!subjectId) return null;

      const now = new Date();
      if (current.revokedAt) {
        const benignRace =
          current.replacedById !== null &&
          now.getTime() - current.revokedAt.getTime() < REUSE_GRACE_MS;
        if (!benignRace) {
          await this.revokeFamily(current.familyId, tx);
          return null;
        }
      }
      if (current.expiresAt <= now) return null;

      const next = await this.issue(tx, realm, subjectId, current.familyId, meta);
      if (!current.revokedAt) {
        await tx
          .update(sessions)
          .set({ revokedAt: now, replacedById: next.sessionId, lastUsedAt: now })
          .where(eq(sessions.id, current.id));
      }
      return next;
    });
  }

  /** The live session behind an access token, or null if it was revoked or expired. */
  async findActive(realm: Realm, sessionId: string) {
    const [row] = await this.db
      .select({
        familyId: sessions.familyId,
        userId: sessions.userId,
        adminUserId: sessions.adminUserId,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.id, sessionId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      );
    if (!row) return null;
    const subjectId = realm === 'user' ? row.userId : row.adminUserId;
    return subjectId ? { familyId: row.familyId, subjectId } : null;
  }

  async familyOfRefreshToken(refreshToken: string): Promise<string | null> {
    const [row] = await this.db
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, sha256(refreshToken)));
    return row?.familyId ?? null;
  }

  async familyOfSession(sessionId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    return row?.familyId ?? null;
  }

  async revokeFamily(familyId: string, executor: Executor = this.db) {
    await executor
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  /** Signs a subject out everywhere, optionally keeping one family (the current device). */
  async revokeAll(realm: Realm, subjectId: string, exceptFamilyId?: string) {
    const subject =
      realm === 'user' ? eq(sessions.userId, subjectId) : eq(sessions.adminUserId, subjectId);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          subject,
          isNull(sessions.revokedAt),
          exceptFamilyId ? ne(sessions.familyId, exceptFamilyId) : undefined,
        ),
      );
  }

  /** One entry per signed-in device: the live head of each session family. */
  async listForUser(userId: string, currentFamilyId: string) {
    const rows = await this.db
      .select({
        id: sessions.id,
        familyId: sessions.familyId,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sessions.createdAt));

    const seen = new Set<string>();
    return rows
      .filter((row) => !seen.has(row.familyId) && seen.add(row.familyId))
      .map(({ familyId, ...row }) => ({ ...row, current: familyId === currentFamilyId }));
  }

  /** Family of a user's session, if that session belongs to them. */
  async familyOwnedBy(userId: string, sessionId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    return row?.familyId ?? null;
  }

  private async issue(
    executor: Executor,
    realm: Realm,
    subjectId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<StartedSession> {
    const refreshToken = randomToken();
    const [row] = await executor
      .insert(sessions)
      .values({
        userId: realm === 'user' ? subjectId : null,
        adminUserId: realm === 'admin' ? subjectId : null,
        familyId,
        refreshTokenHash: sha256(refreshToken),
        userAgent: meta.userAgent,
        ipHash: hmac(this.env.AUTH_SECRET, meta.ip),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC[realm] * 1000),
      })
      .returning({ id: sessions.id });

    const sessionId = row!.id;
    const accessToken = await this.tokens.signAccess(realm, { subjectId, sessionId });
    return { subjectId, sessionId, familyId, tokens: { accessToken, refreshToken } };
  }
}
