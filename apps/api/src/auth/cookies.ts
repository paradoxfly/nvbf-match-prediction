import { deleteCookie, setCookie } from '@orpc/server/helpers';
import type { Env } from '../config/env';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC, type Realm } from './realm';

export const COOKIE_NAMES: Record<Realm, { access: string; refresh: string; hint: string }> = {
  user: { access: 'pd_at', refresh: 'pd_rt', hint: 'pd_signed_in' },
  admin: { access: 'pd_admin_at', refresh: 'pd_admin_rt', hint: 'pd_admin_signed_in' },
};

/**
 * The refresh cookie is only sent to the realm's auth endpoints (refresh + logout), as seen by
 * the browser through the app's /api rewrite.
 */
function refreshPath(realm: Realm, env: Env) {
  return `${env.COOKIE_PATH_PREFIX}/v1/${realm === 'admin' ? 'admin/auth' : 'auth'}`;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export function setAuthCookies(
  headers: Headers | undefined,
  realm: Realm,
  tokens: IssuedTokens,
  env: Env,
) {
  const names = COOKIE_NAMES[realm];
  setCookie(headers, names.access, tokens.accessToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_TTL_SEC,
  });
  setCookie(headers, names.refresh, tokens.refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: refreshPath(realm, env),
    maxAge: REFRESH_TOKEN_TTL_SEC[realm],
  });
  // Not a credential: lets the apps' page proxy tell "probably signed in" from "signed out"
  // after the short-lived access cookie expires, since the refresh cookie isn't sent to pages.
  setCookie(headers, names.hint, '1', {
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SEC[realm],
  });
}

export function clearAuthCookies(headers: Headers | undefined, realm: Realm, env: Env) {
  const names = COOKIE_NAMES[realm];
  deleteCookie(headers, names.access, { path: '/', secure: env.COOKIE_SECURE, httpOnly: true });
  deleteCookie(headers, names.refresh, {
    path: refreshPath(realm, env),
    secure: env.COOKIE_SECURE,
    httpOnly: true,
  });
  deleteCookie(headers, names.hint, { path: '/', secure: env.COOKIE_SECURE });
}
