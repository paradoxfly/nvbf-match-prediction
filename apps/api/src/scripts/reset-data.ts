/**
 * Clears contest data (leagues, teams, days, entries, payments, payouts, logs…) while keeping
 * player and staff accounts, their sessions and app settings. For wiping test data before launch.
 *
 *   node dist/scripts/reset-data.js                          show what would be cleared (no change)
 *   node dist/scripts/reset-data.js --keep teams --keep media_assets   also keep these tables
 *   node dist/scripts/reset-data.js --confirm <database name>   actually clear it
 *
 * When `media_assets` (the logos) is cleared, the uploaded files under STORAGE_LOCAL_DIR go too.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { clearTables, createDatabase, planReset } from '@predict/db';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

/** Uploaded files (both buckets) under the storage folder; 0 if there is none. */
async function countFiles(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await countFiles(path);
    else if (!entry.name.endsWith('.meta')) total += 1;
  }
  return total;
}

async function main() {
  const { values } = parseArgs({
    options: {
      keep: { type: 'string', multiple: true, default: [] },
      confirm: { type: 'string' },
    },
  });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  const storageRoot = resolve(process.env.STORAGE_LOCAL_DIR || '.storage');

  const { db, pool } = createDatabase(databaseUrl, { max: 1 });
  try {
    const plan = await planReset(db, values.keep);
    const clearsMedia = plan.clear.some((entry) => entry.table === 'media_assets');
    const uploadDirs = ['public', 'private'].map((bucket) => join(storageRoot, bucket));
    const files = clearsMedia
      ? (await Promise.all(uploadDirs.map(countFiles))).reduce((a, b) => a + b, 0)
      : 0;

    const line = (entry: { table: string; rows: number }) =>
      `  ${entry.table.padEnd(28)} ${String(entry.rows).padStart(7)} rows`;
    console.warn(`Database "${databaseName}"\n\nWill clear:`);
    for (const entry of plan.clear) console.warn(line(entry));
    if (clearsMedia) console.warn(`  uploaded files in ${storageRoot}: ${files}`);
    console.warn('\nWill keep:');
    for (const entry of plan.keep) console.warn(line(entry));

    if (plan.conflicts.length > 0) {
      console.error('\nCan’t do this: some kept tables point at tables that would be cleared.');
      for (const fk of plan.conflicts) {
        console.error(`  ${fk.table} → ${fk.references} (add --keep ${fk.references})`);
      }
      process.exit(1);
    }
    if (values.confirm === undefined) {
      console.warn(`\nNothing changed. To clear it, run again with --confirm ${databaseName}`);
      return;
    }
    if (values.confirm !== databaseName) {
      throw new Error(`--confirm must be the database name ("${databaseName}"). Nothing changed.`);
    }

    await clearTables(db, plan);
    if (clearsMedia) {
      for (const dir of uploadDirs) {
        if ((await stat(dir).catch(() => null))?.isDirectory()) {
          await rm(dir, { recursive: true, force: true });
        }
      }
    }
    console.warn(
      `\nCleared ${plan.clear.length} tables${clearsMedia ? ` and ${files} uploaded files` : ''}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
