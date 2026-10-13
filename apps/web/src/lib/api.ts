import { createApiClient, createApiQueryUtils, createSessionRefresher } from '@predict/api-client';

/**
 * In the browser requests go through this app's /api rewrite (same origin, first-party cookies).
 * During server rendering there is no origin, so they go straight to the API.
 */
function baseUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/api/v1`;
  return `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/v1`;
}

// A 401 triggers one shared refresh attempt, then the original request is retried once.
const refreshSession = createSessionRefresher(() => apiClient.auth.refresh());

export const apiClient = createApiClient({
  baseUrl,
  clientName: 'web',
  onUnauthorized: refreshSession,
});

/** TanStack Query helpers: `useQuery(api.public.home.queryOptions())`, `api.entries.key()`. */
export const api = createApiQueryUtils(apiClient);
