import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

/** Folder of generated SQL migrations, resolved from both src/ (tsx) and dist/ (built). */
export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies every pending migration using a dedicated single connection. */
export async function migrateDatabase(url: string): Promise<void> {
  const { db, pool } = createDatabase(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
