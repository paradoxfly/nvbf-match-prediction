'use client';

import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { cn } from '@predict/ui/utils';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { can, useAdmin } from '@/components/admin-shell';
import { ApiStatus } from '@/components/api-status';
import { PageHeader, Section } from '@/components/page-header';
import { DayStatusBadge } from '@/components/status-badges';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/ui/stat';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDay, formatNaira, plural } from '@/lib/format';
import type { DayListItem } from '@/lib/types';

const LIVE_REFRESH_MS = 60_000;

export function OverviewScreen() {
  const admin = useAdmin();
  const finance = can(admin, 'finance');

  const open = useQuery(
    api.admin.days.list.queryOptions({
      input: { status: 'open' },
      refetchInterval: LIVE_REFRESH_MS,
    }),
  );
  const closed = useQuery(
    api.admin.days.list.queryOptions({
      input: { status: 'closed' },
      refetchInterval: LIVE_REFRESH_MS,
    }),
  );
  const upcoming = useQuery(api.admin.days.list.queryOptions({ input: { status: 'published' } }));

  const running = [...(open.data?.items ?? []), ...(closed.data?.items ?? [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const loadingDays = open.isPending || closed.isPending;
  const daysError = open.error ?? closed.error;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Overview"
        title={`hello, ${admin.name.split(' ')[0]?.toLowerCase() ?? 'there'}`}
        actions={<ApiStatus />}
      />

      {finance ? <AttentionTiles /> : null}

      <Section
        title="Running now"
        description="Days taking entries, or closed and waiting for results."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/days">
              All match-days
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      >
        {loadingDays ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-44 rounded-lg" />
            <Skeleton className="h-44 rounded-lg" />
          </div>
        ) : daysError && running.length === 0 ? (
          <p className="text-sm text-destructive">{errorMessage(daysError)}</p>
        ) : running.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-6" />}
            title="No match-day is running"
            description="Open a day from Match-days when its fixtures and settings are ready."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {running.map((day) => (
              <LiveDayCard key={day.id} day={day} finance={finance} />
            ))}
          </div>
        )}
      </Section>

      {upcoming.data && upcoming.data.items.length > 0 ? (
        <Section title="Coming up" description="Published days that haven't opened yet.">
          <Card className="gap-0 p-0">
            <ul className="divide-y divide-border">
              {upcoming.data.items.slice(0, 5).map((day) => (
                <li key={day.id}>
                  <Link
                    href={`/days/${day.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-muted/60"
                  >
                    <span className="flex flex-col">
                      <span className="font-semibold">{formatDay(day.date)}</span>
                      <span className="text-xs text-muted-foreground">
                        {day.leagueName}
                        {day.title ? ` · ${day.title}` : ''}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      {plural(day.matchCount, 'match', 'matches')}
                      <DayStatusBadge status={day.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

function LiveDayCard({ day, finance }: { day: DayListItem; finance: boolean }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg leading-tight font-extrabold">{formatDay(day.date)}</p>
          <p className="truncate text-sm text-muted-foreground">
            {day.leagueName}
            {day.title ? ` · ${day.title}` : ''}
          </p>
        </div>
        <DayStatusBadge status={day.status} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Pool" value={formatNaira(day.dailyPoolKobo)} />
        <Stat label="Paid entries" value={day.confirmedEntries.toLocaleString('en-NG')} />
        <Stat label="Matches" value={day.matchCount} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/days/${day.id}`}>Manage day</Link>
        </Button>
        {finance ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/payments?day=${day.id}`}>Payments</Link>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="outline">
          <Link href={`/days/${day.id}?tab=${day.status === 'closed' ? 'leaderboard' : 'results'}`}>
            {day.status === 'closed' ? 'Results & finalize' : 'Results'}
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function AttentionTiles() {
  const claims = useQuery(
    api.admin.payments.queue.queryOptions({
      input: { status: 'payment_review', page: 1, pageSize: 1 },
      refetchInterval: LIVE_REFRESH_MS,
    }),
  );
  const unused = useQuery(
    api.admin.payments.transfers.queryOptions({
      input: { unappliedOnly: true, page: 1, pageSize: 1 },
    }),
  );
  const ready = useQuery(
    api.admin.payouts.list.queryOptions({ input: { status: 'ready', page: 1, pageSize: 1 } }),
  );
  const invalid = useQuery(
    api.admin.payouts.list.queryOptions({
      input: { status: 'details_invalid', page: 1, pageSize: 1 },
    }),
  );

  const tiles = [
    {
      label: 'Payment claims to check',
      query: claims,
      href: '/payments',
      hint: 'Players say they paid. Match them to the bank statement.',
    },
    {
      label: 'Unused money',
      query: unused,
      href: '/payments/transfers?unused=1',
      hint: 'Transfers with money not applied to an entry or refunded.',
    },
    {
      label: 'Payouts ready to send',
      query: ready,
      href: '/payouts?status=ready',
      hint: 'Winners and refunds with bank details on file.',
    },
    {
      label: 'Invalid bank details',
      query: invalid,
      href: '/payouts?status=details_invalid',
      hint: 'Waiting for players to fix their account.',
    },
  ];

  return (
    <Section title="Needs attention">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile) => {
          const total = tile.query.data?.total;
          return (
            <Link
              key={tile.label}
              href={tile.href}
              className="group flex flex-col gap-3 rounded-lg bg-card p-5 shadow-card transition-colors outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/60"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase">
                  {tile.label}
                </span>
                <ArrowRight
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <span
                className={cn(
                  'font-mono text-4xl leading-none font-bold',
                  total ? 'text-foreground' : 'text-muted-foreground',
                )}
                title={tile.query.error ? errorMessage(tile.query.error) : undefined}
              >
                {tile.query.isPending ? '…' : tile.query.error ? '—' : (total ?? 0)}
              </span>
              <span className="text-xs text-muted-foreground">{tile.hint}</span>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
