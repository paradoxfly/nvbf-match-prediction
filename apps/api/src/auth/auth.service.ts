import { Inject, Injectable } from '@nestjs/common';
import { product } from '@predict/brand';
import {
  TERMS_VERSION,
  type CompleteSignupInput,
  type RequestOtpInput,
  type RequestOtpResult,
  type SessionUser,
  type VerifyOtpInput,
} from '@predict/contracts';
import { eq, users, type Database } from '@predict/db';
import { normalizeNigerianPhone } from '@predict/domain';
import { hmac } from '../common/crypto';
import { DomainError } from '../common/domain-error';
import { DAY, enforceLimits, HOUR, MINUTE } from '../common/limits';
import { isUniqueViolation } from '../common/pg-errors';
import { RateLimitService } from '../common/rate-limit.service';
import { verifyTurnstile } from '../common/turnstile';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { SmsService } from '../sms/sms.service';
import { OTP_RESEND_COOLDOWN_SEC, OTP_TTL_SEC, OtpService, type OtpCheck } from './otp.service';
import { SessionService, type ClientMeta, type StartedSession } from './session.service';
import { SIGNUP_TICKET_TTL_SEC, TokenService } from './token.service';

export interface SignedIn {
  session: StartedSession;
  user: SessionUser;
}

export type VerifyOutcome =
  | ({ status: 'signed_in' } & SignedIn)
  | { status: 'needs_profile'; phone: string; signupTicket: string; expiresInSec: number };

/** Per-phone caps on codes sent, counted from the database so they survive restarts. */
const PHONE_HOURLY_CODES = 5;
const PHONE_DAILY_CODES = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly sms: SmsService,
    private readonly limits: RateLimitService,
  ) {}

  /**
   * Texts a sign-in code. The response is the same whether or not the number has an account,
   * so this can't be used to discover who plays.
   */
  async requestOtp(input: RequestOtpInput, meta: ClientMeta): Promise<RequestOtpResult> {
    const phone = this.normalize(input.phone);
    await enforceLimits(this.limits, [
      { key: `otp:ip:${meta.ip}`, limit: 20, windowSec: HOUR },
      { key: `otp:ip-day:${meta.ip}`, limit: 60, windowSec: DAY },
    ]);
    if (!(await verifyTurnstile(this.env.TURNSTILE_SECRET_KEY, input.captchaToken, meta.ip))) {
      throw new DomainError('CAPTCHA_FAILED');
    }

    const now = Date.now();
    const last = await this.otp.lastIssuedAt(phone);
    if (last && now - last.getTime() < OTP_RESEND_COOLDOWN_SEC * 1000) {
      throw new DomainError('RATE_LIMITED', {
        retryAfterSec: Math.ceil((last.getTime() + OTP_RESEND_COOLDOWN_SEC * 1000 - now) / 1000),
      });
    }
    if ((await this.otp.issuedSince(phone, new Date(now - HOUR * 1000))) >= PHONE_HOURLY_CODES) {
      throw new DomainError('RATE_LIMITED', { retryAfterSec: 15 * MINUTE });
    }
    if ((await this.otp.issuedSince(phone, new Date(now - DAY * 1000))) >= PHONE_DAILY_CODES) {
      throw new DomainError('RATE_LIMITED', { retryAfterSec: 6 * HOUR });
    }

    const ipHash = hmac(this.env.AUTH_SECRET, meta.ip);
    const code = await this.otp.issue(phone, ipHash);
    const minutes = Math.round(OTP_TTL_SEC / 60);
    await this.sms.sendNow(
      phone,
      `${code} is your ${product.name} code. It expires in ${minutes} minutes. Never share it with anyone.`,
      'otp',
      { ipHash, storeBody: false },
    );
    // Nothing is texted locally, so hand the code back for the sign-in screen to show. The API
    // refuses to start in production with the console provider; the NODE_ENV check is a backstop.
    const showCode = this.env.SMS_PROVIDER === 'console' && this.env.NODE_ENV !== 'production';
    return {
      phone,
      expiresInSec: OTP_TTL_SEC,
      resendAfterSec: OTP_RESEND_COOLDOWN_SEC,
      ...(showCode ? { devCode: code } : {}),
    };
  }

  async verifyOtp(input: VerifyOtpInput, meta: ClientMeta): Promise<VerifyOutcome> {
    const phone = this.normalize(input.phone);
    await enforceLimits(this.limits, [
      { key: `verify:ip:${meta.ip}`, limit: 30, windowSec: 15 * MINUTE },
    ]);
    this.assertCode(await this.otp.check(phone, input.code));

    const [user] = await this.db.select().from(users).where(eq(users.phone, phone));
    if (user) {
      if (user.status !== 'active') throw new DomainError('ACCOUNT_SUSPENDED');
      await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      return { status: 'signed_in', ...(await this.signIn(user.id, meta)) };
    }

    return {
      status: 'needs_profile',
      phone,
      signupTicket: await this.tokens.signSignupTicket(phone),
      expiresInSec: SIGNUP_TICKET_TTL_SEC,
    };
  }

  /** Creates the account for a phone that just passed an OTP check (the ticket proves it). */
  async completeSignup(input: CompleteSignupInput, meta: ClientMeta): Promise<SignedIn> {
    await enforceLimits(this.limits, [{ key: `signup:ip:${meta.ip}`, limit: 10, windowSec: HOUR }]);
    const phone = await this.tokens.verifySignupTicket(input.signupTicket);
    if (!phone) throw new DomainError('TICKET_EXPIRED');

    const now = new Date();
    try {
      const [created] = await this.db
        .insert(users)
        .values({
          phone,
          displayName: input.displayName,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: now,
          adultConfirmedAt: now,
          lastLoginAt: now,
        })
        .returning({ id: users.id });
      return this.signIn(created!.id, meta);
    } catch (error) {
      if (isUniqueViolation(error, 'displayName')) throw new DomainError('DISPLAY_NAME_TAKEN');
      if (!isUniqueViolation(error, 'phone')) throw error;
      // Double submit: the account now exists, so just sign in.
      const [existing] = await this.db.select().from(users).where(eq(users.phone, phone));
      if (!existing || existing.status !== 'active') throw new DomainError('TICKET_EXPIRED');
      return this.signIn(existing.id, meta);
    }
  }

  async updateProfile(userId: string, displayName: string): Promise<SessionUser> {
    try {
      await this.db.update(users).set({ displayName }).where(eq(users.id, userId));
    } catch (error) {
      if (isUniqueViolation(error, 'displayName')) throw new DomainError('DISPLAY_NAME_TAKEN');
      throw error;
    }
    return this.sessionUser(userId);
  }

  /** Rotates the refresh token. Null means "signed out" (bad token, or account no longer usable). */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<SignedIn | null> {
    const session = await this.sessions.rotate('user', refreshToken, meta);
    if (!session) return null;

    const [user] = await this.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, session.subjectId));
    if (!user || user.status !== 'active') {
      await this.sessions.revokeFamily(session.familyId);
      return null;
    }

    return { session, user: await this.sessionUser(session.subjectId) };
  }

  async logout(refreshToken: string | undefined, accessSessionId: string | undefined) {
    const familyId =
      (refreshToken && (await this.sessions.familyOfRefreshToken(refreshToken))) ||
      (accessSessionId && (await this.sessions.familyOfSession(accessSessionId)));
    if (familyId) await this.sessions.revokeFamily(familyId);
  }

  async sessionUser(userId: string): Promise<SessionUser> {
    const [row] = await this.db
      .select({ id: users.id, phone: users.phone, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new Error(`User ${userId} not found`);
    return row;
  }

  private async signIn(userId: string, meta: ClientMeta): Promise<SignedIn> {
    const session = await this.sessions.start('user', userId, meta);
    return { session, user: await this.sessionUser(userId) };
  }

  private normalize(raw: string): string {
    const phone = normalizeNigerianPhone(raw);
    if (!phone) throw new DomainError('INVALID_PHONE');
    return phone;
  }

  private assertCode(result: OtpCheck) {
    if (result.ok) return;
    if (result.reason === 'expired') throw new DomainError('CODE_EXPIRED');
    throw new DomainError('INVALID_CODE', { attemptsLeft: result.attemptsLeft });
  }
}
