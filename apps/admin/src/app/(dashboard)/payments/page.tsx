import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentsScreen } from './_components/payments-screen';

export const metadata: Metadata = { title: 'Payments' };

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsScreen />
    </Suspense>
  );
}
