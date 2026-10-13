import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

const PAGES: Array<{
  path: string;
  priority: number;
  changeFrequency: 'daily' | 'monthly' | 'yearly';
}> = [
  { path: '', priority: 1, changeFrequency: 'daily' },
  { path: '/leaderboard', priority: 0.8, changeFrequency: 'daily' },
  { path: '/jackpot', priority: 0.8, changeFrequency: 'daily' },
  { path: '/standings', priority: 0.7, changeFrequency: 'daily' },
  { path: '/rules', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/faq', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const site = siteUrl();
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${site}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
