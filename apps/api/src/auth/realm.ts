import type { AdminRole } from '@predict/contracts';

/** Players and staff sign in separately, with separate cookies and session lifetimes. */
export type Realm = 'user' | 'admin';

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

export const REFRESH_TOKEN_TTL_SEC: Record<Realm, number> = {
  user: 30 * 24 * 60 * 60,
  admin: 12 * 60 * 60,
};

export interface UserAuth {
  realm: 'user';
  userId: string;
  sessionId: string;
  familyId: string;
}

export interface AdminAuth {
  realm: 'admin';
  adminId: string;
  role: AdminRole;
  sessionId: string;
  familyId: string;
}

export type RequestAuth = UserAuth | AdminAuth;

/** Where a guard stores the authenticated principal on the Express request. */
export const AUTH_REQUEST_KEY = 'predictAuth';
