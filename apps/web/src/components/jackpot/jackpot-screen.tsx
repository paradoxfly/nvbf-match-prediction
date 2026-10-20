'use client';

import { CATEGORY_LABELS } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useQuery } from '@tanstack/react-query';
import { ClockIcon, GemIcon, TrophyIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError } from '@/components/query-error';
import { useOptionalSession } from '@/components/session';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker, SectionTitle } from '@/components/ui/text';
import { api } from '@/lib/api';
import { clockOffset, useServerNow } from '@/lib/clock';
import { errorCode } from '@/lib/errors';
import { formatCountdown, formatMoment, formatNaira, ordinal, plural } from '@/lib/format';
import type { JackpotData, MyJackpotData } from '@/lib/types';
import { initialOrders, JackpotEditor } from './jackpot-editor';
import { SortableTable } from './sortable-table';

const STATUS_LABELS: Record<JackpotData['jackpot']['status'], string> = {
  open: 'Open',
  closed: 'Entries closed',
  settled: 'Won',
  carried_over: 'Carried over',
};

function Hero({ data, offset }: { data: JackpotData; offset: number }) {
  const now = useServerNow(offset);
  const { jackpot } = data;
  const closesIn = new Date(jackpot.entryClosesAt).getTime() - now;
  const open = jackpot.status === 'open' && closesIn > 0;
  return (
    <section
      aria-labelledby="jackpot-heading"
      className="overflow-hidden rounded-2xl bg-sg-night p-6 text-sg-chalk sm:p-8"
    >
      <p className="font-mono text-[10px] tracking-[2px] text-sg-chalk/60 uppercase">
        {jackpot.leagueName} · {STATUS_LABELS[jackpot.status]}
      </p>
      <h1 id="jackpot-heading" className="mt-6 text-sm font-bold text-sg-chalk/85">
        league jackpot
      </h1>
      <p className="mt-1 font-mono text-[clamp(2rem,11vw,4.5rem)] leading-none font-bold tracking-[-2px] text-sg-flash">
        {formatNaira(data.winner?.amountKobo ?? jackpot.guaranteedKobo)}
      </p>
      {jackpot.pendingKobo > 0 ? (
        <p className="mt-3 text-sm text-sg-chalk/80">
          + about {formatNaira(jackpot.pendingKobo)} from today&apos;s games, once today&apos;s
          winners are confirmed
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-sg-chalk/10 pt-5 text-sm">
        <p className="flex items-center gap-2 text-sg-chalk/80">
          <ClockIcon aria-hidden className="size-4" />
          {open ? (
            <span>
              Entries close in{' '}
              <time dateTime={jackpot.entryClosesAt} className="font-mono font-bold text-sg-chalk">
                {formatCountdown(closesIn)}
              </time>
            </span>
          ) : (
            <span>Entries closed {formatMoment(jackpot.entryClosesAt)}</span>
          )}
        </p>
        <p className="text-sg-chalk/80">
          <span className="font-mono font-bold text-sg-chalk">
            {jackpot.entries.toLocaleString('en-NG')}
          </span>{' '}
          {jackpot.entries === 1 ? 'prediction' : 'predictions'}
        </p>
      </div>
    </section>
  );
}

function WinnerBanner({ data }: { data: JackpotData }) {
  if (data.jackpot.status === 'carried_over') {
    return (
      <Card className="flex-row items-center gap-3">
        <GemIcon aria-hidden className="size-6 shrink-0" />
        <p className="text-sm">
          Nobody qualified this time, so the jackpot carries over to the next league.
        </p>
      </Card>
    );
  }
  if (!data.winner) return null;
  return (
    <Card className="flex-row items-center gap-4 border-2 border-sg-night shadow-none">
      <TrophyIcon aria-hidden className="size-7 shrink-0" />
      <div>
        <Kicker>winner</Kicker>
        <p className="text-lg font-extrabold">{data.winner.displayName}</p>
        <p className="text-sm text-muted-foreground">
          Won {formatNaira(data.winner.amountKobo)}, {plural(data.winner.distance, 'place')} off in
          total.
        </p>
      </div>
    </Card>
  );
}

function HowItWorks() {
  const points = [
    "Predict the final men's and women's league tables.",
    'For each team, we count how many places you are off, and add them up. The lowest total wins the whole jackpot.',
    'You can change your prediction until entries close. After that, nobody can change it.',
    'Equal totals: whoever saved their final tables first wins. Changing them resets your time.',
    'To win, you need at least one paid, confirmed daily entry in this league.',
  ];
  return (
    <section aria-labelledby="jackpot-how" className="flex flex-col gap-3">
      <SectionTitle id="jackpot-how" title="how it works" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {points.map((point, index) => (
          <li key={index} className="flex gap-3 rounded-lg bg-muted p-4 text-sm">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sg-night font-mono text-xs font-bold text-sg-chalk"
            >
              {index + 1}
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm">
        <Link href="/rules#jackpot" className="font-semibold underline underline-offset-4">
          Full jackpot rules
        </Link>
      </p>
    </section>
  );
}

function EntryStatusLine({ mine }: { mine: MyJackpotData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {mine.eligible ? (
        <Badge variant="success">Eligible to win</Badge>
      ) : (
        <Link href="/play" className="inline-flex">
          <Badge variant="default">Play one daily contest to qualify</Badge>
        </Link>
      )}
      {mine.submittedAt ? (
        <span className="text-muted-foreground">
          Saved {formatMoment(mine.submittedAt)}.
          {mine.canSubmit ? ' You can change it until entries close.' : ''}
        </span>
      ) : null}
    </div>
  );
}

function MyPrediction({
  data,
  mine,
  onChange,
}: {
  data: JackpotData;
  mine: MyJackpotData;
  /** Set while entries are open: switches to the editor. */
  onChange?: () => void;
}) {
  if (!mine.orders) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          You didn&apos;t enter the jackpot this time.
        </p>
      </Card>
    );
  }
  const orders = initialOrders(data.tables, mine.orders);
  return (
    <Card className="gap-5">
      <div className="flex flex-col gap-1">
        <Kicker>your prediction</Kicker>
        {data.jackpot.status === 'open' ? (
          <p className="text-lg font-extrabold">You&apos;re in. Good luck!</p>
        ) : null}
        {mine.position !== null && mine.distance !== null ? (
          <p className="text-lg font-extrabold">
            You&apos;re {ordinal(mine.position)} · {plural(mine.distance, 'place')} off
          </p>
        ) : null}
      </div>
      {onChange ? (
        <Button variant="outline" className="w-fit" onClick={onChange}>
          Change my prediction
        </Button>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        {data.tables.map((table) => (
          <section key={table.category} className="flex flex-col gap-3">
            <h3 className="font-extrabold">{CATEGORY_LABELS[table.category]}</h3>
            <SortableTable
              id={`jackpot-mine-${table.category}`}
              label={`${CATEGORY_LABELS[table.category]} table, your order`}
              teams={orders[table.category] ?? []}
            />
          </section>
        ))}
      </div>
    </Card>
  );
}

function Ranking({ data }: { data: JackpotData }) {
  if (data.jackpot.status === 'open') return null;
  return (
    <section aria-labelledby="jackpot-ranking" className="flex flex-col gap-3">
      <SectionTitle
        id="jackpot-ranking"
        title="closest predictions"
        kicker={data.rankingFinal ? 'against the final league tables' : 'against the tables so far'}
        action={
          <Badge variant={data.rankingFinal ? 'success' : 'default'}>
            {data.rankingFinal ? 'Confirmed' : 'Can still change'}
          </Badge>
        }
      />
      {data.ranking.length === 0 ? (
        <EmptyState title="No eligible predictions yet" />
      ) : (
        <Card className="p-2 sm:p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Places off</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ranking.map((row) => (
                <TableRow
                  key={`${row.position}-${row.displayName}`}
                  className={cn(row.mine && 'bg-muted font-semibold')}
                >
                  <TableCell className="font-mono text-xs font-bold">{row.position}</TableCell>
                  <TableCell className="max-w-[12rem] truncate">
                    {row.displayName}
                    {row.mine ? (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">{row.distance}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Lower is better. Equal totals are ordered by who saved their tables first.
      </p>
    </section>
  );
}

function PlayerSection({ data, offset }: { data: JackpotData; offset: number }) {
  // A slow tick is enough to notice entries closing; the editor shouldn't re-render every second.
  const now = useServerNow(offset, 30_000);
  const { user, loading } = useOptionalSession();
  const mine = useQuery({
    ...api.jackpot.mine.queryOptions(),
    enabled: Boolean(user),
    retry: false,
  });
  const [changing, setChanging] = useState(false);
  const open =
    data.jackpot.status === 'open' && new Date(data.jackpot.entryClosesAt).getTime() > now;

  if (!user) {
    if (loading) return <Skeleton className="h-64" />;
    if (!open) return null;
    return (
      <Card className="items-start">
        <Kicker>free to enter</Kicker>
        <p className="text-lg font-extrabold">Sign in to predict the final tables</p>
        <p className="text-sm text-muted-foreground">
          It costs nothing to enter. You need one paid daily entry in this league to win.
        </p>
        <Button asChild>
          <Link href="/sign-in?next=/jackpot">Sign in to play</Link>
        </Button>
      </Card>
    );
  }

  if (!mine.data) {
    if (mine.isError) {
      return errorCode(mine.error) === 'NO_JACKPOT' ? null : (
        <QueryError error={mine.error} onRetry={() => void mine.refetch()} />
      );
    }
    return <Skeleton className="h-64" />;
  }

  const editable = mine.data.canSubmit && open;
  if (data.tables.length === 0 || data.tables.every((table) => table.teams.length === 0)) {
    return <EmptyState title="The teams aren't in yet" description="Check back soon." />;
  }
  return (
    <div className="flex flex-col gap-4">
      <EntryStatusLine mine={mine.data} />
      {editable && (!mine.data.orders || changing) ? (
        <JackpotEditor tables={data.tables} mine={mine.data} onDone={() => setChanging(false)} />
      ) : (
        <MyPrediction
          data={data}
          mine={mine.data}
          onChange={editable ? () => setChanging(true) : undefined}
        />
      )}
    </div>
  );
}

/** The league jackpot: what it's worth, how it works, your prediction and the ranking. */
export function JackpotScreen() {
  const view = useQuery(api.jackpot.view.queryOptions({ refetchInterval: 60_000 }));
  if (!view.data) {
    if (view.isError) {
      return errorCode(view.error) === 'NO_JACKPOT' ? (
        <EmptyState
          icon={<GemIcon aria-hidden className="size-8" />}
          title="There's no jackpot running right now"
          description="A new jackpot starts with the next league."
        />
      ) : (
        <QueryError error={view.error} onRetry={() => void view.refetch()} />
      );
    }
    return (
      <div role="status" aria-label="Loading the jackpot" className="flex flex-col gap-6">
        <Skeleton className="h-64 rounded-2xl bg-sg-night/90" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const offset = clockOffset(view.data.serverNow, view.dataUpdatedAt);
  return (
    <div className="flex flex-col gap-8">
      <Hero data={view.data} offset={offset} />
      <WinnerBanner data={view.data} />
      <HowItWorks />
      <PlayerSection data={view.data} offset={offset} />
      <Ranking data={view.data} />
    </div>
  );
}
