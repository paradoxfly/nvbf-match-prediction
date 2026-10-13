import { DEFAULT_DAY_CONFIG } from '@predict/contracts';
import type { Database } from './client';
import { settings } from './schema';

// Reference data every environment needs. Idempotent: existing rows are left untouched, so
// admins' later edits survive re-seeding.
export async function seedReferenceData(db: Database) {
  const inserted = await db
    .insert(settings)
    .values({ id: 1, defaultDayConfig: DEFAULT_DAY_CONFIG })
    .onConflictDoNothing()
    .returning({ id: settings.id });
  return { settings: inserted.length };
}
