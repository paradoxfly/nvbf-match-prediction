import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RulesScreen } from '@/components/rules-screen';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Rules',
  description:
    'How the daily volleyball prediction contest works: entry, payment, picks, points, ties, prizes and the league jackpot.',
};

export default function RulesPage() {
  return (
    <Suspense
      fallback={
        <article>
          <h1>rules</h1>
          <div className="mt-6 flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        </article>
      }
    >
      <RulesScreen />
    </Suspense>
  );
}
