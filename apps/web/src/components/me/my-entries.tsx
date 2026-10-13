'use client';

import { ENTRY_STATUS_LABELS } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker } from '@/components/ui/text';
import { api } from '@/lib/api';
import { formatDay, formatNaira, ordinal } from '@/lib/format';
import type { MyEntryData } from '@/lib/types';

const FINAL_DAY = new Set(['finalized', 'completed']);

function statusVariant(entry: MyEntryData): 'success' | 'destructive' | 'default' | 'muted' {
  if (entry.disqualified) return 'destructive';
  if (entry.status === 'confirmed') return 'success';
  if (entry.status === 'awaiting_payment' || entry.status === 'payment_review') return 'default';
  return 'muted';
}

function EntryRow({ entry }: { entry: MyEntryData }) {
  const final = FINAL_DAY.has(entry.dayStatus);
  const needsPayment =
    entry.status === 'awaiting_payment' && !entry.disqualified && entry.dayStatus === 'open';
  return (
    <li className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-bold">{formatDay(entry.date)}</span>
          {entry.dayTitle ? (
            <span className="truncate text-xs text-muted-foreground">{entry.dayTitle}</span>
          ) : null}
        </div>
        <Badge variant={statusVariant(entry)}>
          {entry.disqualified ? 'Disqualified' : ENTRY_STATUS_LABELS[entry.status]}
        </Badge>
      </div>
      {final && entry.rank !== null ? (
        <p className="flex flex-wrap gap-x-3 font-mono text-sm">
          <span className="font-bold">{ordinal(entry.rank)}</span>
          <span>{entry.points ?? 0} pts</span>
          <span className={entry.prizeKobo ? 'font-bold' : 'text-muted-foreground'}>
            {entry.prizeKobo ? formatNaira(entry.prizeKobo) : 'no prize'}
          </span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        {needsPayment ? (
          <Link href={`/play/${entry.date}/pay`} className="underline underline-offset-4">
            Pay {formatNaira(entry.feeKobo)}
          </Link>
        ) : null}
        <Link href={`/play/${entry.date}`} className="underline underline-offset-4">
          Picks
        </Link>
        <Link href={`/leaderboard/${entry.date}`} className="underline underline-offset-4">
          Results
        </Link>
      </div>
    </li>
  );
}

/** Every day the player entered, newest first. */
export function MyEntries() {
  const query = useQuery(api.entries.myEntries.queryOptions());
  return (
    <Card>
      <div className="flex flex-col gap-1">
        <Kicker>history</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">my entries</h2>
      </div>
      {query.data ? (
        query.data.items.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              You haven&apos;t entered a match day yet.
            </p>
            <Button asChild size="sm">
              <Link href="/play">Play today</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {query.data.items.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton className="h-32" />
      )}
    </Card>
  );
}
