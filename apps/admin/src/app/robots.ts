import type { MetadataRoute } from 'next';

/** The dashboard is staff-only: keep every page out of search results. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', disallow: '/' }] };
}
