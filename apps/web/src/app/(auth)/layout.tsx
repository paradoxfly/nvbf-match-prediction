import { product } from '@predict/brand';
import { Logo } from '@predict/ui/logo';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center bg-sg-surface/50 px-4 py-8">
      <Link href="/" className="mb-8" aria-label={`${product.name} home`}>
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-card sm:p-8">
        {children}
      </div>
    </main>
  );
}
