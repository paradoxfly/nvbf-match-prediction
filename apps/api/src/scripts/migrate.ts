/**
 * Applies pending migrations from a built API (the Docker image has no tsx for `pnpm db:migrate`).
 *
 *   node dist/scripts/migrate.js
 */
import { resolve } from 'node:path';
import { migrateDatabase } from '@predict/db';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  await migrateDatabase(databaseUrl);
  console.warn('Migrations applied.');
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
