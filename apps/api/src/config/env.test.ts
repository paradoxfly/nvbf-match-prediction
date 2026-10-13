import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
const AUTH_SECRET = 'x'.repeat(32);
const DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const BASE = { DATABASE_URL, AUTH_SECRET, DATA_ENCRYPTION_KEY };

describe('parseEnv', () => {
  it('requires DATABASE_URL, AUTH_SECRET and DATA_ENCRYPTION_KEY', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*DATA_ENCRYPTION_KEY/);
  });

  it('rejects a short AUTH_SECRET', () => {
    expect(() => parseEnv({ ...BASE, AUTH_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() => parseEnv({ ...BASE, DATA_ENCRYPTION_KEY: 'abc' })).toThrow(/32 bytes/);
  });

  it('requires provider credentials for real SMS', () => {
    expect(() => parseEnv({ ...BASE, SMS_PROVIDER: 'termii' })).toThrow(/TERMII_API_KEY/);
    expect(() => parseEnv({ ...BASE, SMS_PROVIDER: 'bulksmsnigeria' })).toThrow(
      /BULKSMSNIGERIA_API_TOKEN/,
    );
  });

  it('refuses console SMS and local storage in production', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
      /STORAGE_DRIVER[\s\S]*SMS_PROVIDER/,
    );
  });

  it('turns on admin MFA and secure cookies by default in production only', () => {
    expect(parseEnv(BASE).ADMIN_MFA_REQUIRED).toBe(false);
    const prod = parseEnv({
      ...BASE,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'termii',
      TERMII_API_KEY: 'k',
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'a',
      R2_ACCESS_KEY_ID: 'b',
      R2_SECRET_ACCESS_KEY: 'c',
      R2_BUCKET_NAME: 'd',
      R2_PUBLIC_URL: 'https://cdn.example.com',
    });
    expect(prod.ADMIN_MFA_REQUIRED).toBe(true);
    expect(prod.COOKIE_SECURE).toBe(true);
  });

  it('treats empty optional values as unset', () => {
    const env = parseEnv({ ...BASE, REDIS_URL: '', SENTRY_DSN: '' });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('rejects a non-redis REDIS_URL', () => {
    expect(() => parseEnv({ ...BASE, REDIS_URL: 'http://example.com' })).toThrow(/REDIS_URL/);
  });
});
