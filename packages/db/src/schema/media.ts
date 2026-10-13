import { bigint, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps, tstz } from './_shared';
import { mediaBucket, mediaKind, mediaStatus } from './enums';
import { adminUsers } from './identity';

/**
 * Every uploaded file (team and sponsor logos). Uploads go straight to storage via a presigned
 * URL; the row starts `pending` and becomes `ready` only after the API has checked the object.
 */
export const mediaAssets = pgTable('media_assets', {
  id: id(),
  uploadedByAdminId: uuid().references(() => adminUsers.id, { onDelete: 'set null' }),
  kind: mediaKind().notNull(),
  bucket: mediaBucket().notNull(),
  storageKey: text().notNull().unique(),
  mimeType: text().notNull(),
  sizeBytes: bigint({ mode: 'number' }).notNull(),
  width: integer(),
  height: integer(),
  status: mediaStatus().notNull().default('pending'),
  confirmedAt: tstz(),
  deletedAt: tstz(),
  ...timestamps,
});
