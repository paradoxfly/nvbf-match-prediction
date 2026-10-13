export * as schema from './schema';
export * from './schema';
export {
  createDatabase,
  type Database,
  type DatabaseHandle,
  type Executor,
  type Transaction,
} from './client';
export { migrateDatabase, migrationsFolder } from './migrate';
export { seedReferenceData } from './seed-data';
export { ALWAYS_KEEP, clearTables, planReset, type ResetPlan } from './reset';
export {
  and,
  arrayContains,
  asc,
  between,
  count,
  countDistinct,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notInArray,
  or,
  sql,
  sum,
} from 'drizzle-orm';
// Re-exported so consumers share this package's drizzle types (importing drizzle directly
// from a CommonJS app resolves a second, incompatible copy of the type declarations).
export type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
export { alias } from 'drizzle-orm/pg-core';
