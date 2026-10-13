export type Bucket = 'public' | 'private';

export interface ObjectInfo {
  size: number;
  contentType: string | null;
}

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
}

/**
 * Object storage used for every uploaded file. Browsers upload directly to it with presigned
 * URLs; the API only reads objects back to verify and process them.
 */
export interface ObjectStorage {
  presignUpload(
    bucket: Bucket,
    key: string,
    file: { contentType: string; contentLength: number },
    ttlSec: number,
  ): Promise<PresignedUpload>;
  head(bucket: Bucket, key: string): Promise<ObjectInfo | null>;
  /** Reads an object (or its first `maxBytes`). */
  read(bucket: Bucket, key: string, maxBytes?: number): Promise<Buffer>;
  write(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  remove(bucket: Bucket, key: string): Promise<void>;
  /** Permanent URL for a public object. */
  publicUrl(key: string): string;
  /** Short-lived URL for a private object (e.g. an ID document for a reviewer). */
  presignDownload(
    bucket: Bucket,
    key: string,
    ttlSec: number,
    options?: { fileName?: string },
  ): Promise<string>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/** An `inline` Content-Disposition with a file name safe to put in a header. */
export const inlineDisposition = (fileName: string) =>
  `inline; filename="${fileName.replace(/[^\w.-]+/g, '_')}"`;
