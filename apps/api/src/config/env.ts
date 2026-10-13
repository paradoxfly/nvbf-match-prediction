import { z } from 'zod';

/** Treats `KEY=` (empty) in a .env file the same as the key being absent. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    APP_VERSION: z.string().default('0.0.0-dev'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Proxy hops to trust for the client IP (Next rewrite in dev; load balancer in prod). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(1),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    /** Optional. When set, rate limits are shared between API instances and survive restarts. */
    REDIS_URL: optional(z.url({ protocol: /^rediss?$/ })),

    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    ADMIN_ORIGIN: z.url().default('http://localhost:3001'),

    /** Signs access tokens and keys the HMACs for OTPs and IP hashes. Rotate = sign everyone out. */
    AUTH_SECRET: z.string().min(32, { error: 'AUTH_SECRET must be at least 32 characters.' }),
    /**
     * 32-byte key (base64) that encrypts bank account numbers and admin TOTP secrets.
     * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     */
    DATA_ENCRYPTION_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
      error: 'DATA_ENCRYPTION_KEY must be 32 bytes, base64-encoded.',
    }),
    /** Label stored next to each ciphertext so the key can be rotated later. */
    DATA_ENCRYPTION_KEY_ID: z.string().min(1).max(32).default('k1'),
    /** Path prefix under which browsers reach the API (the Next /api rewrite). */
    COOKIE_PATH_PREFIX: z.string().default('/api'),
    COOKIE_SECURE: optional(bool),
    /** Admins must turn on two-step sign-in before using the dashboard. Defaults on in production. */
    ADMIN_MFA_REQUIRED: optional(bool),

    /** `console` logs emails (development only); `zapiack` sends them for real. */
    EMAIL_TRANSPORT: z.enum(['console', 'zapiack']).default('console'),
    /** A sending address on a domain verified with the email provider. */
    EMAIL_FROM: z.email().default('predict@scoutgram.africa'),
    ZAPIACK_API_KEY: optional(z.string()),
    /** The approved message template (create it with `node dist/scripts/zapiack-template.js`). */
    ZAPIACK_TEMPLATE_ID: optional(z.string()),
    ZAPIACK_BASE_URL: z.url().default('https://api.zapiack.com/v1'),
    /** Hard stop on emails per day across everyone, so abuse can't burn the plan's volume. */
    EMAIL_DAILY_CAP: z.coerce.number().int().min(1).default(5000),

    /** Cloudflare Turnstile on "send code"; unset skips the check (development). */
    TURNSTILE_SECRET_KEY: optional(z.string()),

    /**
     * `local` keeps files under STORAGE_LOCAL_DIR and serves them from the API (development and
     * tests). `r2` uses a public Cloudflare R2 bucket for team and sponsor logos.
     */
    STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
    STORAGE_LOCAL_DIR: z.string().default('.storage'),
    /** Browser-visible base path of the API's local storage routes (through the /api rewrite). */
    STORAGE_LOCAL_BASE_URL: z.string().default('/api/v1/storage'),
    /** Namespaces every object key, so a bucket can be shared with other projects safely. */
    STORAGE_KEY_PREFIX: z.string().default('predict/'),
    R2_ACCOUNT_ID: optional(z.string()),
    R2_ACCESS_KEY_ID: optional(z.string()),
    R2_SECRET_ACCESS_KEY: optional(z.string()),
    R2_BUCKET_NAME: optional(z.string()),
    R2_PUBLIC_URL: optional(z.url()),

    SENTRY_DSN: optional(z.url()),
    /** Seconds between background ticks (auto-open/close days, email outbox). 0 = off. */
    TICKER_INTERVAL_SEC: z.coerce.number().int().min(0).default(20),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_TRANSPORT === 'zapiack') {
      for (const key of ['ZAPIACK_API_KEY', 'ZAPIACK_TEMPLATE_ID'] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'Required for zapiack.' });
      }
    }
    if (env.STORAGE_DRIVER === 'r2') {
      for (const key of [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET_NAME',
        'R2_PUBLIC_URL',
      ] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required for r2.' });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (env.STORAGE_DRIVER !== 'r2') {
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_DRIVER'],
          message: 'Production must use r2.',
        });
      }
      if (env.EMAIL_TRANSPORT === 'console') {
        ctx.addIssue({
          code: 'custom',
          path: ['EMAIL_TRANSPORT'],
          message: 'Production must send real email (zapiack).',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    ADMIN_MFA_REQUIRED: env.ADMIN_MFA_REQUIRED ?? env.NODE_ENV === 'production',
  }));

export type Env = z.infer<typeof EnvSchema>;

/** Parses and validates the environment. Throws with every problem listed, so boot fails fast. */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
