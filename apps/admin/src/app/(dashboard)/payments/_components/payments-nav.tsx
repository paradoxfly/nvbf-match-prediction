'use client';

import { cn } from '@predict/ui/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/payments', label: 'Entry payments' },
  { href: '/payments/transfers', label: 'Bank transfers' },
];

/** Switches between the entry queue and the bank statement records. */
export function PaymentsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Payments" className="inline-flex w-fit gap-1 rounded-full bg-muted p-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground',
              active && 'bg-background text-foreground shadow-card',
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
