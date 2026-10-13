import { hash, verify } from '@node-rs/argon2';

// argon2id with the library defaults (19 MiB, 2 passes, 1 lane) — the OWASP-recommended profile.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check when the account doesn't exist, so response timing
 * doesn't reveal which emails are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('predict-timing-equalizer');
  await verifyPassword(await dummyHash, password);
  return false;
}
