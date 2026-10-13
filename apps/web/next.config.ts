import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { securityHeaders } from './security-headers';

// Browsers only ever talk to this app's origin. /api/* is proxied to the Nest API, so auth
// cookies stay first-party and no CORS is needed. Rewrites are fixed at build time, so Docker
// builds pass API_ORIGIN as a build argument.
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const config: NextConfig = {
  // Docker images run the self-contained server (NEXT_OUTPUT=standalone); `next start` otherwise.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Builds run from the app folder; tracing from the repo root picks up workspace packages.
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@predict/ui'],
  async headers() {
    // /api responses are proxied from the API, which sets its own headers.
    return [{ source: '/((?!api/).*)', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};

export default config;
