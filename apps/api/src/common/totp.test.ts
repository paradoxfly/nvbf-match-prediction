import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, totpCode, verifyTotp } from './totp';

// RFC 6238 appendix B test vectors (SHA-1 secret "12345678901234567890"), last 6 digits.
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it.each([
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ])('matches the RFC vector at t=%i', (time, code) => {
    expect(totpCode(SECRET, Math.floor(time / 30))).toBe(code);
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from('hello world, totp!');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('accepts the previous step for clock drift and rejects older ones', () => {
    const now = new Date(1111111111 * 1000);
    const previous = totpCode(SECRET, Math.floor(1111111111 / 30) - 1);
    const old = totpCode(SECRET, Math.floor(1111111111 / 30) - 3);
    expect(verifyTotp(SECRET, previous, now)).toBe(Math.floor(1111111111 / 30) - 1);
    expect(verifyTotp(SECRET, old, now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', now)).toBeNull();
  });
});
