import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PayoutsScreen } from './_components/payouts-screen';

export const metadata: Metadata = { title: 'Payouts & refunds' };

export default function PayoutsPage() {
  return (
    <Suspense>
      <PayoutsScreen />
    </Suspense>
  );
}
