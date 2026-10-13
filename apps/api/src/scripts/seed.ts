/**
 * Seeds reference data from a built API (the Docker image has no tsx for `pnpm db:seed`).
 * Safe to re-run: existing rows are left alone.
 *
 *   node dist/scripts/seed.js
 */
import { resolve } from 'node:path';
import { createDatabase, seedReferenceData } from '@predict/db';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  const { db, pool } = createDatabase(databaseUrl, { max: 1 });
  try {
    const counts = await seedReferenceData(db);
    console.warn('Reference data seeded (existing rows untouched):', counts);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
