import { parseEnv, type Env } from '../../src/config/env';

/** A valid environment for tests; override what a test cares about. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    APP_VERSION: '1.2.3',
    LOG_LEVEL: 'fatal',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
    AUTH_SECRET: 'test-secret-that-is-at-least-thirty-two-characters',
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    COOKIE_PATH_PREFIX: '',
    TICKER_INTERVAL_SEC: '0',
    ...overrides,
  });
}
