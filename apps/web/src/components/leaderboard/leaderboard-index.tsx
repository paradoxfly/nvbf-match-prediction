'use client';

import { DAY_STATUS_LABELS } from '@predict/contracts';
import { EmptyState } from '@predict/ui/states';
import { useQuery } from '@tanstack/react-query';
import { ListOrderedIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { QueryError } from '@/components/query-error';
import { LoadingBlocks } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/text';
import { api } from '@/lib/api';
import { BOARD_STATUSES } from '@/lib/days';
import { formatDay, formatNaira } from '@/lib/format';

/** /leaderboard opens the featured day's board, else the latest one, else lists the days. */
export function LeaderboardIndex() {
  const router = useRouter();
  const home = useQuery(api.public.home.queryOptions());
  const data = home.data;
  const boards = (data?.days ?? []).filter((day) => BOARD_STATUSES.has(day.status));
  const featured =
    data?.featured && BOARD_STATUSES.has(data.featured.status) ? data.featured : null;
  const target = featured?.date ?? boards[boards.length - 1]?.date ?? null;

  useEffect(() => {
    if (target) router.replace(`/leaderboard/${target}`);
  }, [target, router]);

  if (!data) {
    if (home.isError) return <QueryError error={home.error} onRetry={() => void home.refetch()} />;
    return <LoadingBlocks label="Opening the latest results" rows={2} />;
  }

  if (target) return <LoadingBlocks label="Opening the latest results" rows={2} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker={data.leagueName ?? 'results'} title="results" />
      {data.days.length === 0 ? (
        <EmptyState
          icon={<ListOrderedIcon aria-hidden className="size-8" />}
          title="No results yet"
          description="Leaderboards appear here once the first match day opens."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg bg-card shadow-card">
          {data.days.map((day) => (
            <li key={day.date} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex flex-col">
                <span className="font-bold">{formatDay(day.date)}</span>
                <span className="text-xs text-muted-foreground">
                  {DAY_STATUS_LABELS[day.status]} · pool {formatNaira(day.dailyPoolKobo)}
                </span>
              </span>
              {BOARD_STATUSES.has(day.status) ? (
                <Link
                  href={`/leaderboard/${day.date}`}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Leaderboard
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
