import { ORPCError } from '@orpc/nest';
import { DomainError } from './domain-error';

/**
 * Turns a service's `DomainError('NOT_FOUND')` into a plain 404. Not-found isn't declared on
 * each route's contract, so it can't go through `withContractErrors`.
 */
export async function orNotFound<T>(thing: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'NOT_FOUND') {
      throw new ORPCError('NOT_FOUND', { message: `${thing} not found.` });
    }
    throw error;
  }
}
