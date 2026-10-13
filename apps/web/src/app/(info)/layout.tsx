import { product } from '@predict/brand';
import { Logo } from '@predict/ui/logo';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Plain reading layout for the policy and help pages. */
export default function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label={`${product.name} home`}>
            <Logo />
          </Link>
          <Link href="/play" className="text-sm font-bold">
            Play today
          </Link>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2 [&_h1]:text-4xl [&_h1]:leading-none [&_h1]:font-black [&_h1]:tracking-[-1.5px] [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5"
      >
        {children}
      </main>
      <footer className="border-t border-border">
        <nav
          aria-label="Policies"
          className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground sm:px-6"
        >
          <Link href="/rules">Rules</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
