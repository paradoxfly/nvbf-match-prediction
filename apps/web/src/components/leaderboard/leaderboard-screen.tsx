'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useQuery } from '@tanstack/react-query';
import { ListOrderedIcon } from 'lucide-react';
import Link from 'next/link';
import { QueryError } from '@/components/query-error';
import { useOptionalSession } from '@/components/session';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker, PageHeader } from '@/components/ui/text';
import { api } from '@/lib/api';
import { BOARD_STATUSES } from '@/lib/days';
import { errorCode } from '@/lib/errors';
import { formatDay, formatMoment, formatNaira, plural } from '@/lib/format';
import type { DayCardData, LeaderboardRowData, MyStandingData } from '@/lib/types';

const rankText = (row: LeaderboardRowData) => `${row.tied ? '=' : ''}${row.rank}`;

function DaySwitcher({ days, current }: { days: readonly DayCardData[]; current: string }) {
  const boards = days.filter((day) => BOARD_STATUSES.has(day.status));
  if (boards.length < 2) return null;
  return (
    <nav aria-label="Match days" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 pb-1">
        {boards.map((day) => {
          const active = day.date === current;
          return (
            <li key={day.date} className="shrink-0">
              <Link
                href={`/leaderboard/${day.date}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap',
                  active
                    ? 'border-sg-night bg-sg-night text-sg-flash'
                    : 'border-sg-night/15 hover:bg-muted',
                )}
              >
                {formatDay(day.date)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MyStandingCard({ standing, date }: { standing: MyStandingData; date: string }) {
  const row = standing.row;
  return (
    <Card className="gap-3 border-2 border-sg-night p-4 shadow-none sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <Kicker>you</Kicker>
        <Link href={`/play/${date}`} className="text-sm font-semibold underline underline-offset-4">
          Your picks
        </Link>
      </div>
      {row ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
          {[
            { label: 'Rank', value: rankText(row) },
            { label: 'Points', value: row.points },
            { label: 'Set diff', value: row.closeness },
            { label: 'Prize', value: row.prizeKobo !== null ? formatNaira(row.prizeKobo) : '—' },
          ].map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col-reverse gap-1">
              <dt className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
                {stat.label}
              </dt>
              <dd className="truncate font-mono text-lg leading-none font-bold">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          {standing.reason ?? "You're not on this leaderboard."}
        </p>
      )}
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <Kicker>how to read this</Kicker>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <dt className="inline font-bold text-foreground">Pts: </dt>
          <dd className="inline">points from the set scores you predicted.</dd>
        </div>
        <div>
          <dt className="inline font-bold text-foreground">Set diff: </dt>
          <dd className="inline">
            how many points your set scores were off in total. Lower is better, and it breaks ties.
          </dd>
        </div>
        <div>
          <dt className="inline font-bold text-foreground">Exact: </dt>
          <dd className="inline">matches where you got the exact set score.</dd>
        </div>
        <div>
          <dt className="inline font-bold text-foreground">=: </dt>
          <dd className="inline">
            tied players. They share the prize money of the places they take up.
          </dd>
        </div>
      </dl>
    </div>
  );
}

function BoardTable({ rows, me }: { rows: readonly LeaderboardRowData[]; me: string | null }) {
  const myName = me?.toLowerCase() ?? null;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10 px-2 sm:px-3">#</TableHead>
          <TableHead className="px-2 sm:px-3">Player</TableHead>
          <TableHead className="px-2 text-right sm:px-3">Pts</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Set diff</TableHead>
          <TableHead className="hidden text-right sm:table-cell">Exact</TableHead>
          <TableHead className="px-2 text-right sm:px-3">Prize</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => {
          const mine = myName !== null && row.displayName.toLowerCase() === myName;
          return (
            <TableRow
              key={`${row.rank}-${row.displayName}-${index}`}
              className={cn(mine && 'bg-muted font-semibold')}
            >
              <TableCell className="px-2 font-mono text-xs font-bold whitespace-nowrap sm:px-3">
                {rankText(row)}
              </TableCell>
              <TableCell className="max-w-[9rem] px-2 sm:max-w-[14rem] sm:px-3">
                <span className="block truncate">
                  {row.displayName}
                  {mine ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
                </span>
                {/* Phones: the tie-break columns fold under the name. */}
                <span className="block font-mono text-[11px] font-normal text-muted-foreground sm:hidden">
                  Set diff {row.closeness} · Exact {row.exactCount}
                </span>
              </TableCell>
              <TableCell className="px-2 text-right font-mono font-extrabold sm:px-3">
                {row.points}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-muted-foreground sm:table-cell">
                {row.closeness}
              </TableCell>
              <TableCell className="hidden text-right font-mono text-muted-foreground sm:table-cell">
                {row.exactCount}
              </TableCell>
              <TableCell className="px-2 text-right font-mono whitespace-nowrap sm:px-3">
                {row.prizeKobo !== null ? formatNaira(row.prizeKobo) : '—'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** One day's leaderboard, with the signed-in player's own standing pinned on top. */
export function LeaderboardScreen({ date }: { date: string }) {
  const { user } = useOptionalSession();
  const board = useQuery(
    api.leaderboard.day.queryOptions({
      input: { date, limit: 100 },
      refetchInterval: (current) => (current.state.data?.final ? false : 30_000),
    }),
  );
  const mine = useQuery({
    ...api.leaderboard.mine.queryOptions({ input: { date } }),
    enabled: Boolean(user),
    retry: false,
  });
  const home = useQuery(api.public.home.queryOptions());

  const header = (
    <PageHeader
      kicker={`${formatDay(date)} · results`}
      title="leaderboard"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href={`/play/${date}`}>{user ? 'Your picks' : 'Play'}</Link>
        </Button>
      }
    />
  );

  if (!board.data) {
    if (board.isError) {
      return (
        <div className="flex flex-col gap-6">
          {header}
          {errorCode(board.error) === 'NOT_FOUND' ? (
            <EmptyState
              icon={<ListOrderedIcon aria-hidden className="size-8" />}
              title="No leaderboard for this day"
              description="There's no contest on this date, or it hasn't started yet."
              action={
                <Button asChild variant="outline">
                  <Link href="/leaderboard">Latest results</Link>
                </Button>
              }
            />
          ) : (
            <QueryError error={board.error} onRetry={() => void board.refetch()} />
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div role="status" aria-label="Loading the leaderboard" className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  const data = board.data;
  return (
    <div className="flex flex-col gap-6">
      {header}
      {home.data ? <DaySwitcher days={home.data.days} current={date} /> : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Badge variant={data.final ? 'success' : 'default'}>
          {data.final ? 'Winners confirmed' : 'Can still change'}
        </Badge>
        <span className="font-mono font-bold">
          {data.scoredMatches}/{data.totalMatches}{' '}
          <span className="font-sans font-semibold">results in</span>
        </span>
        <span className="text-muted-foreground">{plural(data.totalPlayers, 'player')}</span>
        <span className="text-xs text-muted-foreground">
          Updated {formatMoment(data.updatedAt)}
        </span>
      </div>
      {!data.final ? (
        <p className="-mt-3 text-xs text-muted-foreground">
          This can still change until every result is confirmed and we announce the winners.
        </p>
      ) : null}

      {user && mine.data ? <MyStandingCard standing={mine.data} date={date} /> : null}

      {data.rows.length === 0 ? (
        <EmptyState
          icon={<ListOrderedIcon aria-hidden className="size-8" />}
          title="No one is ranked yet"
          description="Players appear here once their payment is confirmed and the first result is in."
        />
      ) : (
        <Card className="gap-2 p-2 sm:p-4">
          <BoardTable rows={data.rows} me={user?.displayName ?? null} />
          {data.totalPlayers > data.rows.length ? (
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              Showing the top {data.rows.length} of {plural(data.totalPlayers, 'player')}.
            </p>
          ) : null}
        </Card>
      )}

      <Legend />
    </div>
  );
}
