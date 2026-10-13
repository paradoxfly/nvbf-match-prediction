/**
 * Applies pending migrations from a built API (the Docker image has no tsx for `pnpm db:migrate`).
 * The container runs it on every start, so it waits a little for the database to come up, and
 * on failure says why in plain words (Drizzle hides the real error in `cause`).
 *
 *   node dist/scripts/migrate.js
 */
import { resolve } from 'node:path';
import { migrateDatabase } from '@predict/db';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const ATTEMPTS = 30;
const RETRY_DELAY_MS = 2000;

/** Network and Postgres codes that usually clear once the database has finished starting. */
const RETRYABLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  '57P03',
]);

const UNKNOWN_HOST =
  "That host name doesn't exist on this network. Use the Postgres service's Internal Connection URL " +
  '(its host is the App Name), and keep the API and the database in the same Dokploy project.';

const HINTS: Record<string, string> = {
  ENOTFOUND: UNKNOWN_HOST,
  EAI_AGAIN: UNKNOWN_HOST,
  ECONNREFUSED: 'Nothing accepted the connection. Is the Postgres service running, on port 5432?',
  ETIMEDOUT: 'The connection timed out. Is the Postgres service running and on the same network?',
  '28P01':
    'Wrong user or password. Copy the Internal Connection URL again; if you typed the password, ' +
    'URL-encode any special characters in it (@ : / # ? % &).',
  '28000': 'The database refused this user. Check the user name in DATABASE_URL.',
  '3D000': "That database doesn't exist. Check the database name at the end of DATABASE_URL.",
  '42501':
    "This user isn't allowed to create the migrations schema. Use the Postgres service's own " +
    'user, the one in its Internal Connection URL.',
};

interface Reason {
  message: string;
  code?: string;
}

/** Every error in the chain: the error, its `cause`s, and the parts of an AggregateError. */
function reasons(error: unknown, seen = new Set<unknown>()): Reason[] {
  if (!error || typeof error !== 'object' || seen.has(error)) return [];
  seen.add(error);
  const { message, code, cause, errors } = error as {
    message?: string;
    code?: string;
    cause?: unknown;
    errors?: unknown[];
  };
  // Drizzle appends the query parameters; the migration queries have none.
  const text = (message ?? '').replace(/\nparams: ?$/, '');
  const own = text || code ? [{ message: text || code || '', code }] : [];
  const nested = [cause, ...(Array.isArray(errors) ? errors : [])].flatMap((inner) =>
    reasons(inner, seen),
  );
  return [...own, ...nested];
}

/** "user@host:port/database", never the password. */
function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    const database = parsed.pathname.replace(/^\//, '') || '(none)';
    return `${decodeURIComponent(parsed.username) || '(no user)'}@${parsed.host}/${database}`;
  } catch {
    return 'an unreadable DATABASE_URL (URL-encode special characters in the password)';
  }
}

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  const target = describeTarget(databaseUrl);

  for (let attempt = 1; ; attempt++) {
    try {
      await migrateDatabase(databaseUrl);
      console.warn('Migrations applied.');
      return;
    } catch (error) {
      const chain = reasons(error);
      const codes = chain.flatMap((reason) => (reason.code ? [reason.code] : []));
      const retryable = codes.some((code) => RETRYABLE.has(code));
      if (retryable && attempt < ATTEMPTS) {
        console.warn(
          `Database at ${target} isn't reachable yet (${codes.join(', ')}); retrying (${attempt}/${ATTEMPTS})…`,
        );
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.error(`Migrations failed against ${target}.`);
      for (const reason of chain) {
        console.error(`  ${reason.code ? `[${reason.code}] ` : ''}${reason.message}`);
      }
      const hints = [...new Set(codes.flatMap((code) => (HINTS[code] ? [HINTS[code]] : [])))];
      for (const hint of hints) console.error(`Hint: ${hint}`);
      process.exit(1);
    }
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
