import type { NextFunction, Request, Response } from 'express';

/**
 * Baseline response headers for a JSON API (what helmet would set, minus what doesn't apply).
 * The API never serves pages, so browsers may not render or frame its responses, except for
 * dev-mode local storage files (the CV preview is framed) and the API docs page.
 */
export function securityHeaders(options: { production: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (options.production) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    }
    const path = req.path;
    if (!path.startsWith('/v1/storage/') && !path.startsWith('/docs')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.setHeader('X-Frame-Options', 'DENY');
    }
    next();
  };
}
