import { ORPCError } from '@predict/api-client';
import { formatNaira } from '@predict/domain';

/** The API error code, e.g. `TOTP_REQUIRED`, or undefined for network/unknown failures. */
export function errorCode(error: unknown): string | undefined {
  return error instanceof ORPCError ? error.code : undefined;
}

/** A message safe to show staff. Contract errors carry friendly copy from the API. */
export function errorMessage(error: unknown): string {
  if (error instanceof ORPCError) {
    if (error.code === 'RATE_LIMITED') {
      const seconds = (error.data as { retryAfterSec?: number } | undefined)?.retryAfterSec;
      return seconds
        ? `Too many attempts. Try again in ${Math.ceil(seconds / 60)} min.`
        : 'Too many attempts. Try again shortly.';
    }
    // An unknown route ("Cannot GET /…"): the API hasn't shipped this part yet.
    if (error.status === 404 && !error.defined && /^Cannot [A-Z]+ /.test(error.message)) {
      return 'This isn’t available on the server yet.';
    }
    if (error.defined || error.status < 500) return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

function errorData(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ORPCError)) return null;
  const data: unknown = error.data;
  return data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** What stops an action (`NOT_READY` errors carry a list of blockers). */
export function errorBlockers(error: unknown): string[] {
  return strings(errorData(error)?.blockers);
}

/**
 * Extra lines worth showing under the message: blockers, result issues, or the money involved
 * when a transfer can't cover an entry fee.
 */
export function errorDetails(error: unknown): string[] {
  const data = errorData(error);
  if (!data) return [];
  const lines = [...strings(data.blockers), ...strings(data.issues)];
  if (typeof data.unappliedKobo === 'number' && typeof data.feeKobo === 'number') {
    lines.push(
      `Unused money left on this transfer: ${formatNaira(data.unappliedKobo)}. Entry fee: ${formatNaira(data.feeKobo)}.`,
    );
  }
  return lines;
}
