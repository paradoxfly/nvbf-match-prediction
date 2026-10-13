import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeagueScreen } from './_components/league-screen';

export const metadata: Metadata = { title: 'League' };

export default function LeaguePage() {
  return (
    <Suspense>
      <LeagueScreen />
    </Suspense>
  );
}
