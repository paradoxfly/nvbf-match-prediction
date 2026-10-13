import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DaysScreen } from './_components/days-screen';

export const metadata: Metadata = { title: 'Match-days' };

export default function DaysPage() {
  return (
    <Suspense>
      <DaysScreen />
    </Suspense>
  );
}
