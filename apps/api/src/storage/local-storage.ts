import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { hmac, safeEqual } from '../common/crypto';
import type { Bucket, ObjectInfo, ObjectStorage, PresignedUpload } from './storage';

/**
 * Files on local disk, for development and tests. The API itself stands in for the storage
 * service: uploads and private downloads use HMAC-signed URLs checked by LocalStorageController.
 */
export class LocalStorage implements ObjectStorage {
  readonly root: string;

  constructor(
    root: string,
    /** Browser-visible base URL of the storage routes, e.g. `/api/v1/storage`. */
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {
    this.root = resolve(root);
  }

  /** Absolute path for an object, refusing keys that would escape the storage root. */
  pathFor(bucket: Bucket, key: string): string {
    const base = resolve(this.root, bucket);
    const path = resolve(base, key);
    if (!path.startsWith(base + sep)) throw new Error('Invalid storage key');
    return path;
  }

  sign(method: 'PUT' | 'GET', bucket: Bucket, key: string, expires: number, extra = '') {
    return hmac(this.secret, `${method}\n${bucket}\n${key}\n${expires}\n${extra}`);
  }

  verify(
    method: 'PUT' | 'GET',
    bucket: Bucket,
    key: string,
    expires: number,
    signature: string,
    extra = '',
  ) {
    if (!Number.isFinite(expires) || expires < Date.now() / 1000) return false;
    return safeEqual(this.sign(method, bucket, key, expires, extra), signature);
  }

  private url(bucket: Bucket, key: string, query: Record<string, string>) {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${this.baseUrl}/${bucket}/${path}?${new URLSearchParams(query)}`;
  }

  async presignUpload(
    bucket: Bucket,
    key: string,
    file: { contentType: string; contentLength: number },
    ttlSec: number,
  ): Promise<PresignedUpload> {
    const expires = Math.floor(Date.now() / 1000) + ttlSec;
    const extra = `${file.contentType}\n${file.contentLength}`;
    const url = this.url(bucket, key, {
      expires: String(expires),
      type: file.contentType,
      length: String(file.contentLength),
      signature: this.sign('PUT', bucket, key, expires, extra),
    });
    return { url, headers: { 'content-type': file.contentType } };
  }

  async head(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    try {
      const info = await stat(this.pathFor(bucket, key));
      const meta = await readFile(`${this.pathFor(bucket, key)}.meta`, 'utf8').catch(() => '{}');
      return { size: info.size, contentType: JSON.parse(meta).contentType ?? null };
    } catch {
      return null;
    }
  }

  async read(bucket: Bucket, key: string, maxBytes?: number): Promise<Buffer> {
    const path = this.pathFor(bucket, key);
    if (!maxBytes) return readFile(path);
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(maxBytes);
      const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async write(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    const path = this.pathFor(bucket, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    await writeFile(`${path}.meta`, JSON.stringify({ contentType }));
  }

  async remove(bucket: Bucket, key: string) {
    const path = this.pathFor(bucket, key);
    await rm(path, { force: true });
    await rm(`${path}.meta`, { force: true });
  }

  publicUrl(key: string) {
    return `${this.baseUrl}/public/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async presignDownload(
    bucket: Bucket,
    key: string,
    ttlSec: number,
    options?: { fileName?: string },
  ) {
    const expires = Math.floor(Date.now() / 1000) + ttlSec;
    return this.url(bucket, key, {
      expires: String(expires),
      signature: this.sign('GET', bucket, key, expires),
      ...(options?.fileName ? { name: options.fileName } : {}),
    });
  }
}
