import { migrateDatabase } from '../migrate';
import { requireDatabaseUrl } from './env';

await migrateDatabase(requireDatabaseUrl());
console.warn('Migrations applied.');
