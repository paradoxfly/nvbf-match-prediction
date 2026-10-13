import { ORPCError } from '@orpc/nest';

/**
 * A business-rule failure raised by a service. Controllers translate it into the matching typed
 * error declared on the route's contract (see `withContractErrors`), so services stay free of
 * transport concerns.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(code);
  }
}

type ErrorFactories = Record<string, (options?: { data?: never }) => Error & { defined?: boolean }>;

/**
 * Runs a service call and rethrows any DomainError as the contract error with the same code.
 * oRPC's `errors` map builds an error for ANY code, so only errors the route really declares
 * (`defined`) are used. Undeclared `RATE_LIMITED` becomes a 429 with `retryAfterSec`, and
 * `FORBIDDEN` (a role check that depends on data, e.g. correcting a confirmed result) a 403.
 * Other undeclared codes propagate unchanged (and surface as 500s).
 */
export async function withContractErrors<T>(errors: object, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const factory = (errors as ErrorFactories)[error.code];
    const declared = typeof factory === 'function' ? factory({ data: error.data as never }) : null;
    if (declared?.defined) throw declared;
    if (error.code === 'RATE_LIMITED') {
      throw new ORPCError('RATE_LIMITED', {
        status: 429,
        message: 'Too many attempts. Try again shortly.',
        data: error.data,
      });
    }
    if (error.code === 'FORBIDDEN') {
      const message = typeof error.data?.message === 'string' ? error.data.message : undefined;
      throw new ORPCError('FORBIDDEN', { message: message ?? 'Your role does not allow this.' });
    }
    throw error;
  }
}
