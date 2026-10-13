import { ORPCError, UploadError } from '@predict/api-client';

/** The API error code, e.g. `INVALID_CODE`, or undefined for network/unknown failures. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ORPCError ? error.code : undefined;
}

/** A message safe to show a player. Contract errors carry friendly copy from the API. */
export function errorMessage(error: unknown): string {
  if (error instanceof UploadError) return error.message;
  if (error instanceof ORPCError) {
    if (error.code === 'RATE_LIMITED') {
      const seconds = (error.data as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      if (!seconds) return 'Too many attempts. Try again shortly.';
      return seconds < 90
        ? `Too many attempts. Try again in ${seconds} seconds.`
        : `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`;
    }
    if (error.code === 'INVALID_CODE') {
      const left = (error.data as { attemptsLeft?: number } | undefined)?.attemptsLeft;
      return left ? `That code is not right. ${left} tries left.` : 'That code is not right.';
    }
    if (error.defined || error.status < 500) return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}
