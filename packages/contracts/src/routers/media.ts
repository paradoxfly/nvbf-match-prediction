import { oc } from '@orpc/contract';
import { z } from 'zod';
import { IdParam } from '../common';
import { MediaKind, MediaStatus } from '../enums';

/** Allowed types and size caps per kind. The API enforces these; apps use them for early feedback. */
export const MEDIA_RULES: Record<MediaKind, { mimeTypes: readonly string[]; maxBytes: number }> = {
  team_logo: { mimeTypes: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  sponsor_logo: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
  },
};

export const CreateUploadInput = z.object({
  kind: MediaKind,
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive(),
  fileName: z.string().max(200),
});
export type CreateUploadInput = z.infer<typeof CreateUploadInput>;

export const UploadTicket = z.object({
  mediaId: z.uuid(),
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
  }),
  expiresAt: z.date(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const MediaView = z.object({
  id: z.uuid(),
  kind: MediaKind,
  status: MediaStatus,
  mimeType: z.string(),
  url: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});
export type MediaView = z.infer<typeof MediaView>;

const tags = ['admin-media'];

/** Logos are uploaded by staff only; players never upload files. */
export const adminMediaContract = {
  createUpload: oc
    .route({
      method: 'POST',
      path: '/admin/media/uploads',
      tags,
      summary: 'Get a presigned URL to upload a logo directly to storage',
    })
    .errors({
      UNSUPPORTED_TYPE: { status: 415, message: 'Use a PNG, JPG or WebP image.' },
      TOO_LARGE: { status: 413, message: 'That image is too large (5 MB max).' },
    })
    .input(CreateUploadInput)
    .output(UploadTicket),

  confirm: oc
    .route({
      method: 'POST',
      path: '/admin/media/{id}/confirm',
      tags,
      summary: 'Verify an uploaded image and make it usable',
    })
    .errors({
      UPLOAD_MISSING: { status: 409, message: 'We could not find the uploaded file. Try again.' },
      INVALID_FILE: { status: 422, message: 'That file is damaged or not an image.' },
    })
    .input(IdParam)
    .output(MediaView),
};
