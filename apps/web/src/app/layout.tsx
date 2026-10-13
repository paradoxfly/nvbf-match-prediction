import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';
import { product } from '@predict/brand';
import { siteUrl } from '@/lib/site';
import { Providers } from './providers';

const display = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700', '800', '900'],
  variable: '--font-hanken-grotesk',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-jetbrains-mono',
});

const DESCRIPTION =
  'Predict every volleyball match of the day — the set score and the points in every set. ' +
  'Pay once a day, climb the leaderboard and win cash. Plus a league jackpot for the final table.';

export const metadata: Metadata = {
  // Makes every relative URL below (and each page's link preview image) absolute.
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${product.name} — daily volleyball predictions`,
    template: `%s · ${product.name}`,
  },
  description: DESCRIPTION,
  applicationName: product.name,
  category: 'sports',
  openGraph: {
    type: 'website',
    siteName: product.name,
    title: `${product.name} — daily volleyball predictions`,
    description: DESCRIPTION,
    url: siteUrl(),
    locale: 'en_NG',
  },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0A' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-sg-night focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
