import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, emailOtps, eq, gte, isNull, sql, type Database } from '@predict/db';
import { hmac, randomOtp, safeEqual } from '../common/crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';

export const OTP_TTL_SEC = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SEC = 60;

export type OtpCheck =
  | { ok: true }
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'invalid'; attemptsLeft: number };

/** Email sign-in codes, keyed by address. Only an HMAC of each code is stored. */
@Injectable()
export class OtpService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Creates a new code, invalidating any earlier unused code for the same address. */
  async issue(email: string, ipHash: string | null): Promise<string> {
    const code = randomOtp();
    await this.db.transaction(async (tx) => {
      await tx
        .update(emailOtps)
        .set({ consumedAt: new Date() })
        .where(and(eq(emailOtps.email, email), isNull(emailOtps.consumedAt)));
      await tx.insert(emailOtps).values({
        email,
        codeHash: this.hash(email, code),
        expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
        ipHash,
      });
    });
    return code;
  }

  /** Checks a code; a correct code is consumed so it can't be used twice. */
  async check(email: string, code: string): Promise<OtpCheck> {
    return this.db.transaction(async (tx) => {
      const [otp] = await tx
        .select()
        .from(emailOtps)
        .where(and(eq(emailOtps.email, email), isNull(emailOtps.consumedAt)))
        .orderBy(desc(emailOtps.createdAt))
        .limit(1)
        .for('update');

      if (!otp || otp.expiresAt <= new Date() || otp.attempts >= OTP_MAX_ATTEMPTS) {
        return { ok: false, reason: 'expired' } as const;
      }

      if (!safeEqual(otp.codeHash, this.hash(email, code))) {
        await tx
          .update(emailOtps)
          .set({ attempts: sql`${emailOtps.attempts} + 1` })
          .where(eq(emailOtps.id, otp.id));
        return {
          ok: false,
          reason: 'invalid',
          attemptsLeft: Math.max(0, OTP_MAX_ATTEMPTS - otp.attempts - 1),
        } as const;
      }

      await tx.update(emailOtps).set({ consumedAt: new Date() }).where(eq(emailOtps.id, otp.id));
      return { ok: true } as const;
    });
  }

  async lastIssuedAt(email: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ createdAt: emailOtps.createdAt })
      .from(emailOtps)
      .where(eq(emailOtps.email, email))
      .orderBy(desc(emailOtps.createdAt))
      .limit(1);
    return row?.createdAt ?? null;
  }

  async issuedSince(email: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(emailOtps)
      .where(and(eq(emailOtps.email, email), gte(emailOtps.createdAt, since)));
    return row?.n ?? 0;
  }

  private hash(email: string, code: string) {
    return hmac(this.env.AUTH_SECRET, `otp:${email}:${code}`);
  }
}
