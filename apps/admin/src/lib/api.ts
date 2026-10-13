import { createApiClient, createApiQueryUtils, createSessionRefresher } from '@predict/api-client';

function baseUrl() {
  if (typeof window !== 'undefined') return `${window.location.origin}/api/v1`;
  return `${process.env.API_ORIGIN ?? 'http://localhost:4000'}/v1`;
}

// A 401 triggers one shared refresh attempt, then the original request is retried once.
const refreshSession = createSessionRefresher(() => apiClient.admin.auth.refresh());

export const apiClient = createApiClient({
  baseUrl,
  clientName: 'admin',
  onUnauthorized: refreshSession,
});

export const api = createApiQueryUtils(apiClient);
