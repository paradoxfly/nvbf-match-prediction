'use client';

import { Button } from '@predict/ui/button';
import { EmptyState } from '@predict/ui/states';
import { useQuery } from '@tanstack/react-query';
import { CalendarClockIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { QueryError } from '@/components/query-error';
import { LoadingBlocks } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

/** /play opens the featured day's picks (today, else the next day coming up). */
export function PlayIndex() {
  const router = useRouter();
  const home = useQuery(api.public.home.queryOptions());
  const date = home.data?.featured?.date;

  useEffect(() => {
    if (date) router.replace(`/play/${date}`);
  }, [date, router]);

  if (home.isError && !home.data) {
    return <QueryError error={home.error} onRetry={() => void home.refetch()} />;
  }
  if (home.data && !home.data.featured) {
    return (
      <EmptyState
        icon={<CalendarClockIcon aria-hidden className="size-8" />}
        title="Nothing to play yet"
        description="There's no match day open or coming up. Check back soon."
        action={
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        }
      />
    );
  }
  return <LoadingBlocks label="Opening today's picks" rows={2} />;
}
