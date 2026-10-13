// Response headers for every page. Kept next to next.config.ts because the CSP lists the
// third parties this app really loads; update it when adding one.

const production = process.env.NODE_ENV === 'production';

const csp = {
  'default-src': ["'self'"],
  // Next injects inline bootstrap scripts; dev mode also needs eval for fast refresh.
  'script-src': ["'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"])],
  'style-src': ["'self'", "'unsafe-inline'"],
  // Logos are uploaded to and served by the API through this site's /api proxy.
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  // Errors go to Sentry.
  'connect-src': ["'self'", 'https://*.sentry.io', ...(production ? [] : ['ws:'])],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

const contentSecurityPolicy = [
  ...Object.entries(csp).map(([directive, sources]) => `${directive} ${sources.join(' ')}`),
  ...(production ? ['upgrade-insecure-requests'] : []),
].join('; ');

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(production
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];
