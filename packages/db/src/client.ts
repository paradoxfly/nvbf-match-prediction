import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
}

export function createDatabase(url: string, options: { max?: number } = {}): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db, pool };
}

/** A transaction handle, as passed to `db.transaction(async (tx) => ...)`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Anything that can run queries: the pool-backed database or an open transaction. */
export type Executor = Database | Transaction;
