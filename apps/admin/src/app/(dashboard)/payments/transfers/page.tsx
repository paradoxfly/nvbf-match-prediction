import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TransfersScreen } from './_components/transfers-screen';

export const metadata: Metadata = { title: 'Bank transfers' };

export default function TransfersPage() {
  return (
    <Suspense>
      <TransfersScreen />
    </Suspense>
  );
}
