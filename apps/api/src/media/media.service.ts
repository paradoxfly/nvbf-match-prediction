import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MEDIA_RULES,
  type CreateUploadInput,
  type MediaKind,
  type MediaView,
  type UploadTicket,
} from '@predict/contracts';
import { and, eq, inArray, mediaAssets, type Database, type Executor } from '@predict/db';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { uuidv7 } from 'uuidv7';
import { DomainError } from '../common/domain-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB } from '../database/database.module';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage';

export type MediaAsset = typeof mediaAssets.$inferSelect;

const UPLOAD_TTL_SEC = 15 * 60;
const SNIFF_BYTES = 4100;
/** Logos are fitted inside this square (transparent padding), so they line up in lists. */
const LOGO_EDGE = 512;

/**
 * Team and sponsor logos uploaded by staff. The browser uploads straight to storage with a
 * presigned URL; the API then checks the real file type and re-encodes it (which also strips
 * any metadata) before it can be used.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async createUpload(adminId: string, input: CreateUploadInput): Promise<UploadTicket> {
    const rules = MEDIA_RULES[input.kind];
    if (!rules.mimeTypes.includes(input.mimeType)) throw new DomainError('UNSUPPORTED_TYPE');
    if (input.sizeBytes > rules.maxBytes) throw new DomainError('TOO_LARGE');

    const storageKey = `${this.env.STORAGE_KEY_PREFIX}${input.kind}/${uuidv7()}`;
    const [asset] = await this.db
      .insert(mediaAssets)
      .values({
        uploadedByAdminId: adminId,
        kind: input.kind,
        bucket: 'public',
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      })
      .returning({ id: mediaAssets.id });

    const upload = await this.storage.presignUpload(
      'public',
      storageKey,
      { contentType: input.mimeType, contentLength: input.sizeBytes },
      UPLOAD_TTL_SEC,
    );
    return {
      mediaId: asset!.id,
      upload: { ...upload, method: 'PUT' },
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SEC * 1000),
    };
  }

  /** Checks the stored object is really an image of an allowed type, then normalises it. */
  async confirm(mediaId: string): Promise<MediaView> {
    const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId));
    if (!asset || asset.status === 'deleted') throw new DomainError('NOT_FOUND');
    if (asset.status === 'ready') return this.view(asset);
    if (asset.status !== 'pending') throw new DomainError('INVALID_FILE');

    const info = await this.storage.head(asset.bucket, asset.storageKey);
    if (!info) throw new DomainError('UPLOAD_MISSING');

    const rules = MEDIA_RULES[asset.kind];
    const head = await this.storage.read(asset.bucket, asset.storageKey, SNIFF_BYTES);
    const detected = await fileTypeFromBuffer(head);
    const valid =
      info.size === asset.sizeBytes &&
      info.size <= rules.maxBytes &&
      detected !== undefined &&
      rules.mimeTypes.includes(detected.mime);
    if (!valid) {
      await this.reject(asset);
      throw new DomainError('INVALID_FILE');
    }

    try {
      const original = await this.storage.read(asset.bucket, asset.storageKey);
      const { data, info: image } = await sharp(original, { failOn: 'error' })
        .rotate()
        .resize({
          width: LOGO_EDGE,
          height: LOGO_EDGE,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
      await this.storage.write(asset.bucket, asset.storageKey, data, 'image/webp');
      const [ready] = await this.db
        .update(mediaAssets)
        .set({
          mimeType: 'image/webp',
          sizeBytes: data.length,
          width: image.width,
          height: image.height,
          status: 'ready',
          confirmedAt: new Date(),
        })
        .where(eq(mediaAssets.id, asset.id))
        .returning();
      return this.view(ready!);
    } catch (error) {
      this.logger.warn(`Image processing failed for ${asset.id}: ${(error as Error).message}`);
      await this.reject(asset);
      throw new DomainError('INVALID_FILE');
    }
  }

  /** Loads a ready asset of an allowed kind, for attaching to a team or sponsor. */
  async requireReady(executor: Executor, mediaId: string, kinds: MediaKind[]): Promise<MediaAsset> {
    const [asset] = await executor
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaId),
          eq(mediaAssets.status, 'ready'),
          inArray(mediaAssets.kind, kinds),
        ),
      );
    if (!asset) throw new DomainError('MEDIA_NOT_READY');
    return asset;
  }

  urlFor(asset: Pick<MediaAsset, 'bucket' | 'storageKey' | 'status'> | null | undefined) {
    if (!asset || asset.status !== 'ready' || asset.bucket !== 'public') return null;
    return this.storage.publicUrl(asset.storageKey);
  }

  /** Public URL from the joined columns of a query (null when there is no ready logo). */
  urlFromKey(storageKey: string | null | undefined, status: string | null | undefined) {
    return storageKey && status === 'ready' ? this.storage.publicUrl(storageKey) : null;
  }

  view(asset: MediaAsset): MediaView {
    return {
      id: asset.id,
      kind: asset.kind,
      status: asset.status,
      mimeType: asset.mimeType,
      url: this.urlFor(asset),
      width: asset.width,
      height: asset.height,
    };
  }

  private async reject(asset: MediaAsset) {
    await this.db
      .update(mediaAssets)
      .set({ status: 'rejected' })
      .where(eq(mediaAssets.id, asset.id));
    await this.storage.remove(asset.bucket, asset.storageKey).catch(() => undefined);
  }
}
