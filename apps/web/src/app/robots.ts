import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/** Public contest pages are open to crawlers; account pages are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/me', '/sign-in', '/play/'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
