import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlayersScreen } from './_components/players-screen';

export const metadata: Metadata = { title: 'Players' };

export default function PlayersPage() {
  return (
    <Suspense>
      <PlayersScreen />
    </Suspense>
  );
}
