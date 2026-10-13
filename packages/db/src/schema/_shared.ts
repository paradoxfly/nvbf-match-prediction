import { bigint, customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** Case-insensitive text (requires the `citext` extension, created in the first migration). */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/** Time-ordered uuid primary key, generated app-side so inserts don't need a round trip. */
export const id = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** Money in kobo. `bigint` in Postgres; amounts stay far below 2^53 so a JS number is exact. */
export const kobo = () => bigint({ mode: 'number' });

/** Timestamps are always stored with a time zone (UTC on the wire). */
export const tstz = () => timestamp({ withTimezone: true });

export const timestamps = {
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
