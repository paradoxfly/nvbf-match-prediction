import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

/** URL-safe random token, e.g. a refresh token. 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Uniform 6-digit code, zero-padded. */
export function randomOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/** Constant-time comparison for equal-length secrets; false for different lengths. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * AES-256-GCM for data we must be able to read back (bank account numbers, TOTP secrets).
 * Output: `${keyId}:${iv}:${tag}:${ciphertext}`, all base64url, so the key can be rotated later.
 */
export function encrypt(key: Buffer, keyId: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    keyId,
    iv.toString('base64url'),
    tag.toString('base64url'),
    body.toString('base64url'),
  ].join(':');
}

export function decrypt(keys: Record<string, Buffer>, payload: string): string {
  const [keyId, iv, tag, body] = payload.split(':');
  const key = keyId ? keys[keyId] : undefined;
  if (!key || !iv || !tag || body === undefined) throw new Error('Unreadable ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
