import { z } from 'zod';

// Field schemas shared by the API (validation) and the apps (form validation).

export const Email = z.email({ error: 'Enter a valid email address.' }).max(254);

export const Password = z
  .string()
  .min(10, { error: 'Use at least 10 characters.' })
  .max(128, { error: 'Use at most 128 characters.' });

export const PersonName = z
  .string()
  .trim()
  .min(1, { error: 'Required.' })
  .max(60, { error: 'Use at most 60 characters.' });

/** A phone number as typed. The API normalises it to E.164 (+234…) and checks it's Nigerian. */
export const PhoneInput = z
  .string()
  .trim()
  .min(7, { error: 'Enter your phone number.' })
  .max(20, { error: 'That number is too long.' });

/** Public name on leaderboards. Unique (case-insensitive) so nobody can impersonate a winner. */
export const DisplayName = z
  .string()
  .trim()
  .min(3, { error: 'Use at least 3 characters.' })
  .max(20, { error: 'Use at most 20 characters.' })
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*[A-Za-z0-9]$/, {
    error: 'Use letters, numbers, spaces, dots, dashes or underscores.',
  });

export const OtpCode = z.string().regex(/^\d{6}$/, { error: 'Enter the 6-digit code.' });

/** An amount of money in kobo (₦1 = 100 kobo). Never a float. */
export const Kobo = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Basis points: 10 000 = 100%. */
export const Bps = z.number().int().min(0).max(10_000);

/** A calendar date in Lagos time, `YYYY-MM-DD`. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Use YYYY-MM-DD.' });

/** A wall-clock time in Lagos time, `HH:MM` (24h). */
export const ClockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Use HH:MM (24-hour).' });

export const Reason = z
  .string()
  .trim()
  .min(3, { error: 'Give a short reason.' })
  .max(500, { error: 'Use at most 500 characters.' });

/**
 * A yes/no query-string flag. Query strings arrive as text, and `z.coerce.boolean()` would read
 * the string "false" as true, so "true"/"false" (or real booleans) are mapped explicitly.
 */
export const QueryFlag = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);

export const Ok = z.object({ ok: z.literal(true) });
export type Ok = z.infer<typeof Ok>;

export const IdParam = z.object({ id: z.uuid() });

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

/** Returned with 429s from any route that is rate limited. */
export const RATE_LIMITED = {
  status: 429,
  message: 'Too many attempts. Try again shortly.',
  data: z.object({ retryAfterSec: z.number().int() }),
} as const;

/**
 * Header every first-party client sends. The API rejects state-changing requests without it,
 * which a cross-site form or fetch cannot add without a (refused) CORS preflight.
 */
export const CLIENT_HEADER = 'x-pd-client';

/** Bump when the rules/terms text changes materially; stored with each player's acceptance. */
export const TERMS_VERSION = '2026-10-13';
