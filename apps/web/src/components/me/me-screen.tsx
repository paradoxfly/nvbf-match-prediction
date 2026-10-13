'use client';

import { Button } from '@predict/ui/button';
import Link from 'next/link';
import { SessionGate, useSignOut } from '@/components/session';
import { Kicker } from '@/components/ui/text';
import { MyEntries } from './my-entries';
import { BankDetailsNudge, ObligationsCard } from './obligations-card';
import { PayoutAccountCard } from './payout-account-card';
import { ProfileCard } from './profile-card';

const HELP_LINKS = [
  { href: '/rules', label: 'Rules' },
  { href: '/faq', label: 'Questions and answers' },
  { href: '/standings', label: 'League standings' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

function MeContent() {
  const signOut = useSignOut();
  return (
    <div className="flex flex-col gap-6">
      <ProfileCard />
      <BankDetailsNudge />
      <div className="grid items-start gap-6 md:grid-cols-2">
        <ObligationsCard />
        <PayoutAccountCard />
      </div>
      <MyEntries />
      <nav aria-label="Help" className="flex flex-col gap-3">
        <Kicker>help</Kicker>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          {HELP_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Button
        variant="outline"
        className="self-start"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate({})}
      >
        {signOut.isPending ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  );
}

/** The player's own page: profile, winnings, bank details and entry history. */
export function MeScreen() {
  return (
    <SessionGate>
      <MeContent />
    </SessionGate>
  );
}
