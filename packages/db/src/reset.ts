import { sql } from 'drizzle-orm';
import type { Database } from './client';

/** Never cleared by a reset: player and staff accounts, their sign-in sessions, app settings. */
export const ALWAYS_KEEP = ['users', 'admin_users', 'sessions', 'settings'] as const;

export interface ResetPlan {
  clear: Array<{ table: string; rows: number }>;
  keep: Array<{ table: string; rows: number }>;
  /** Kept tables that point at a cleared one: clearing would leave them broken, so it's refused. */
  conflicts: Array<{ table: string; references: string }>;
}

/**
 * What a reset would do: every table in the public schema is cleared except the always-kept
 * ones and `extraKeep`. Read-only.
 */
export async function planReset(db: Database, extraKeep: string[] = []): Promise<ResetPlan> {
  const tables = (
    await db.execute<{ name: string }>(
      sql`select tablename as name from pg_tables where schemaname = 'public' order by tablename`,
    )
  ).rows.map((row) => row.name);
  const unknown = extraKeep.filter((name) => !tables.includes(name));
  if (unknown.length > 0) throw new Error(`No such table: ${unknown.join(', ')}`);

  const keep = new Set<string>([...ALWAYS_KEEP, ...extraKeep]);
  const counted: Array<{ table: string; rows: number }> = [];
  for (const table of tables) {
    const [row] = (
      await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`)
    ).rows;
    counted.push({ table, rows: row?.n ?? 0 });
  }

  const foreignKeys = (
    await db.execute<{ table: string; references: string }>(sql`
      select distinct src.relname as "table", dst.relname as "references"
      from pg_constraint c
      join pg_class src on src.oid = c.conrelid
      join pg_class dst on dst.oid = c.confrelid
      join pg_namespace n on n.oid = src.relnamespace
      where c.contype = 'f' and n.nspname = 'public'
    `)
  ).rows;

  return {
    clear: counted.filter((entry) => !keep.has(entry.table)),
    keep: counted.filter((entry) => keep.has(entry.table)),
    conflicts: foreignKeys.filter(
      (fk) => fk.table !== fk.references && keep.has(fk.table) && !keep.has(fk.references),
    ),
  };
}

/**
 * Empties the planned tables in one statement. TRUNCATE skips the append-only row triggers, and
 * without CASCADE Postgres refuses outright if a kept table still references a cleared one.
 */
export async function clearTables(db: Database, plan: ResetPlan): Promise<void> {
  if (plan.conflicts.length > 0)
    throw new Error('Refusing to reset: kept tables reference cleared ones.');
  if (plan.clear.length === 0) return;
  const tables = plan.clear.map((entry) => sql.identifier(entry.table));
  await db.execute(sql`truncate table ${sql.join(tables, sql`, `)} restart identity`);
}
