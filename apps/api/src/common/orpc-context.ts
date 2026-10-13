// Per-request values oRPC plugins place on every handler's `context`.
declare module '@orpc/nest' {
  interface ORPCGlobalContext {
    /** Response headers (ResponseHeadersPlugin); used to set auth cookies. */
    resHeaders?: Headers;
  }
}

export {};
