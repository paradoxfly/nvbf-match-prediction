import { createDatabase } from '../client';
import { seedReferenceData } from '../seed-data';
import { requireDatabaseUrl } from './env';

const { db, pool } = createDatabase(requireDatabaseUrl(), { max: 1 });

try {
  const counts = await seedReferenceData(db);
  console.warn('Reference data seeded (existing rows untouched):', counts);
} finally {
  await pool.end();
}
