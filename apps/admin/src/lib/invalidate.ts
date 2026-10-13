import type { QueryClient, QueryKey } from '@tanstack/react-query';

/** Refetches every query under each key (e.g. `api.admin.days.key()` covers all day queries). */
export function invalidate(queryClient: QueryClient, ...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
