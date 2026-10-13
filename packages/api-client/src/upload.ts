import { MEDIA_RULES, type MediaKind, type MediaView } from '@predict/contracts';
import type { ApiClient } from './client';

export class UploadError extends Error {}

interface UploadableFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

interface MinimalXhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: unknown): void;
  abort(): void;
  status: number;
  upload: { onprogress: ((event: { loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}

/** Checks a file against the upload rules before any network call. Returns an error message. */
export function checkUpload(kind: MediaKind, file: UploadableFile): string | null {
  const rules = MEDIA_RULES[kind];
  if (!rules.mimeTypes.includes(file.type)) return 'Use a PNG, JPG or WebP image.';
  if (file.size > rules.maxBytes) {
    return `That file is too large (max ${Math.round(rules.maxBytes / (1024 * 1024))} MB).`;
  }
  return null;
}

/**
 * Uploads a logo straight to storage (staff only) and returns the processed media, reporting
 * progress. Works anywhere XMLHttpRequest exists.
 */
export async function uploadMedia(
  client: ApiClient,
  kind: MediaKind,
  file: UploadableFile,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<MediaView> {
  const problem = checkUpload(kind, file);
  if (problem) throw new UploadError(problem);

  const ticket = await client.admin.media.createUpload({
    kind,
    mimeType: file.type,
    sizeBytes: file.size,
    fileName: file.name.slice(0, 200),
  });

  await new Promise<void>((resolve, reject) => {
    const Xhr = (globalThis as unknown as { XMLHttpRequest: new () => MinimalXhr }).XMLHttpRequest;
    const xhr = new Xhr();
    xhr.open('PUT', ticket.upload.url);
    for (const [name, value] of Object.entries(ticket.upload.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) =>
      options.onProgress?.(event.total ? event.loaded / event.total : 0);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError('Upload failed. Try again.'));
    xhr.onerror = () => reject(new UploadError('Upload failed. Check your connection.'));
    xhr.onabort = () => reject(new UploadError('Upload cancelled.'));
    options.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(file);
  });

  options.onProgress?.(1);
  return client.admin.media.confirm({ id: ticket.mediaId }) as Promise<MediaView>;
}
