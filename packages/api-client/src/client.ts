import { createORPCClient } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { CLIENT_HEADER, contract, type Contract } from '@predict/contracts';

/** Typed client for every route in the contract. Dates arrive as ISO strings (JSON). */
export type ApiClient = JsonifiedClient<ContractRouterClient<Contract>>;

export { CLIENT_HEADER };

/** Auth endpoints whose 401s mean "not signed in", never "refresh and retry". */
const NO_RETRY_PATH = /\/auth\/(refresh|login|logout)$/;

export interface ApiClientOptions {
  /**
   * Base URL including the version prefix, e.g. `https://predict.scoutgram.africa/api/v1`.
   * A function is re-evaluated per request (useful when the origin is only known at runtime).
   */
  baseUrl: string | (() => string);
  /** Identifies the caller, e.g. `web`, `admin`, `mobile`. */
  clientName: string;
  /** Extra headers per request, e.g. forwarding cookies during server rendering. */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  fetch?: typeof fetch;
  /**
   * Called when a request gets a 401. Resolve `true` (e.g. after refreshing the session) to
   * retry the request once. Use `createSessionRefresher` so parallel 401s share one refresh.
   */
  onUnauthorized?: () => Promise<boolean>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const link = new OpenAPILink(contract, {
    url: () => (typeof options.baseUrl === 'function' ? options.baseUrl() : options.baseUrl),
    headers: async () => ({
      [CLIENT_HEADER]: options.clientName,
      ...(await options.headers?.()),
    }),
    fetch: async (request, init) => {
      const send = options.fetch ?? globalThis.fetch;
      const retry = options.onUnauthorized ? request.clone() : undefined;
      const response = await send(request, { ...init, credentials: 'include' });

      if (
        response.status === 401 &&
        retry &&
        !NO_RETRY_PATH.test(new URL(request.url).pathname) &&
        (await options.onUnauthorized!())
      ) {
        return send(retry, { ...init, credentials: 'include' });
      }
      return response;
    },
  });
  return createORPCClient(link);
}

/**
 * Wraps a refresh call so concurrent callers share one in-flight attempt.
 * Resolves `true` when the refresh succeeded.
 */
export function createSessionRefresher(refresh: () => Promise<unknown>): () => Promise<boolean> {
  let inflight: Promise<boolean> | null = null;
  return () => {
    inflight ??= refresh()
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
}
