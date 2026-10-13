import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  inlineDisposition,
  type Bucket,
  type ObjectInfo,
  type ObjectStorage,
  type PresignedUpload,
} from './storage';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  /** Not used by this app yet; private objects are refused until one is configured. */
  privateBucket?: string;
  publicUrl: string;
}

/** Cloudflare R2 through its S3-compatible API. */
export class R2Storage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private bucketName(bucket: Bucket) {
    if (bucket === 'public') return this.config.publicBucket;
    if (!this.config.privateBucket) throw new Error('No private bucket configured');
    return this.config.privateBucket;
  }

  async presignUpload(
    bucket: Bucket,
    key: string,
    file: { contentType: string; contentLength: number },
    ttlSec: number,
  ): Promise<PresignedUpload> {
    // Content-Type and Content-Length are signed, so the upload must match what was declared.
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        ContentType: file.contentType,
        ContentLength: file.contentLength,
      }),
      { expiresIn: ttlSec, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, headers: { 'content-type': file.contentType } };
  }

  async head(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFound') return null;
      throw error;
    }
  }

  async read(bucket: Bucket, key: string, maxBytes?: number): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Range: maxBytes ? `bytes=0-${maxBytes - 1}` : undefined,
      }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async write(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: bucket === 'public' ? 'public, max-age=31536000, immutable' : undefined,
      }),
    );
  }

  async remove(bucket: Bucket, key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
  }

  publicUrl(key: string) {
    return `${this.config.publicUrl.replace(/\/$/, '')}/${key}`;
  }

  presignDownload(bucket: Bucket, key: string, ttlSec: number, options?: { fileName?: string }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        ResponseContentDisposition: options?.fileName
          ? inlineDisposition(options.fileName)
          : undefined,
      }),
      { expiresIn: ttlSec },
    );
  }
}
