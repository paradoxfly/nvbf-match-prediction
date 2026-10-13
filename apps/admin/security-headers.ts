// Response headers for every page. Kept next to next.config.ts because the CSP lists the
// third parties this app really loads; update it when adding one.

const production = process.env.NODE_ENV === 'production';

const csp = {
  'default-src': ["'self'"],
  // Next injects inline bootstrap scripts; dev mode also needs eval for fast refresh.
  'script-src': ["'self'", "'unsafe-inline'", ...(production ? [] : ["'unsafe-eval'"])],
  'style-src': ["'self'", "'unsafe-inline'"],
  // Photos and videos come from the media bucket's own domain.
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'media-src': ["'self'", 'blob:', 'https:'],
  'font-src': ["'self'", 'data:'],
  // Uploads go straight to the bucket with presigned URLs; errors go to Sentry.
  'connect-src': [
    "'self'",
    'https://*.r2.cloudflarestorage.com',
    'https://*.sentry.io',
    ...(production ? [] : ['ws:']),
  ],
  // Video embeds, and PDFs served from the private bucket.
  'frame-src': [
    "'self'",
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://player.vimeo.com',
    'https://drive.google.com',
    'https://*.r2.cloudflarestorage.com',
  ],
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
