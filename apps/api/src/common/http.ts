import { getCookie } from '@orpc/server/helpers';
import type { Request } from 'express';

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  return getCookie(new Headers({ cookie: header }), name);
}

export function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

/** Client IP as resolved by Express using TRUST_PROXY. */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function userAgent(req: Request): string | null {
  const value = req.headers['user-agent'];
  return typeof value === 'string' ? value.slice(0, 256) : null;
}
