'use client';

import { product } from '@predict/brand';
import { Logo } from '@predict/ui/logo';
import { cn } from '@predict/ui/utils';
import {
  CircleUserRoundIcon,
  GemIcon,
  HouseIcon,
  ListOrderedIcon,
  SquarePenIcon,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useOptionalSession } from './session';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefixes that count as "this tab". */
  match: string[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Today', icon: HouseIcon, match: [] },
  { href: '/play', label: 'Play', icon: SquarePenIcon, match: ['/play'] },
  { href: '/leaderboard', label: 'Results', icon: ListOrderedIcon, match: ['/leaderboard'] },
  { href: '/jackpot', label: 'Jackpot', icon: GemIcon, match: ['/jackpot'] },
  { href: '/me', label: 'Me', icon: CircleUserRoundIcon, match: ['/me', '/sign-in'] },
];

const SECONDARY = [
  { href: '/standings', label: 'Standings' },
  { href: '/rules', label: 'Rules' },
  { href: '/faq', label: 'FAQ' },
];

function isActive(item: NavItem, pathname: string) {
  if (item.href === '/') return pathname === '/';
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Public layout: a slim header with the logo and, on phones, a fixed bottom tab bar (the main
 * way around the app). Pages decide for themselves whether they need a signed-in player.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useOptionalSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${product.name} home`}>
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item, pathname) ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-muted',
                  isActive(item, pathname) && 'bg-sg-night text-sg-flash hover:bg-sg-night',
                )}
              >
                {item.label === 'Me' && user ? user.displayName : item.label}
              </Link>
            ))}
          </nav>
          <Link
            href={user ? '/me' : '/sign-in'}
            className="rounded-full border border-sg-night/15 px-3.5 py-1.5 text-sm font-bold md:hidden"
          >
            {user ? user.displayName : 'Sign in'}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-12">
        {children}
      </main>

      <footer className="hidden border-t border-border md:block">
        <nav
          aria-label="More"
          className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-6 py-6 text-sm text-muted-foreground"
        >
          {SECONDARY.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 py-1.5">
          {NAV.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold text-muted-foreground',
                  active && 'text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full',
                    active && 'bg-sg-night text-sg-flash',
                  )}
                >
                  <item.icon aria-hidden className="size-[18px]" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
