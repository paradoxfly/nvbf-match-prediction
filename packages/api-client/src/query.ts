import { createTanstackQueryUtils, type RouterUtils } from '@orpc/tanstack-query';
import type { ApiClient } from './client';

/**
 * TanStack Query helpers derived from the client, e.g.
 * `useQuery(api.system.health.queryOptions())` or `api.system.key()` for invalidation.
 * The return type is declared (not inferred) so the built types reference the live contract
 * instead of a snapshot of it.
 */
export function createApiQueryUtils(client: ApiClient): RouterUtils<ApiClient> {
  return createTanstackQueryUtils(client);
}

export type ApiQueryUtils = RouterUtils<ApiClient>;
