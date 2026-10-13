import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DayScreen } from './_components/day-screen';

export const metadata: Metadata = { title: 'Match-day' };

export default function DayPage() {
  return (
    <Suspense>
      <DayScreen />
    </Suspense>
  );
}
