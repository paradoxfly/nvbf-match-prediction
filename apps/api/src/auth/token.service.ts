import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { ACCESS_TOKEN_TTL_SEC, type Realm } from './realm';

const ISSUER = 'predict';
const SIGNUP_AUDIENCE = 'signup';
export const SIGNUP_TICKET_TTL_SEC = 15 * 60;

export interface AccessClaims {
  subjectId: string;
  sessionId: string;
}

/** Short-lived, stateless tokens (HS256): access tokens (audience = realm) and signup tickets. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) env: Env) {
    this.key = new TextEncoder().encode(env.AUTH_SECRET);
  }

  signAccess(realm: Realm, claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.subjectId)
      .setAudience(realm)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.key);
  }

  async verifyAccess(realm: Realm, token: string): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        audience: realm,
        issuer: ISSUER,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { subjectId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }

  /** Proof that `email` passed a code check, good for finishing signup only. */
  signSignupTicket(email: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(email)
      .setAudience(SIGNUP_AUDIENCE)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${SIGNUP_TICKET_TTL_SEC}s`)
      .sign(this.key);
  }

  async verifySignupTicket(ticket: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(ticket, this.key, {
        algorithms: ['HS256'],
        audience: SIGNUP_AUDIENCE,
        issuer: ISSUER,
      });
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
