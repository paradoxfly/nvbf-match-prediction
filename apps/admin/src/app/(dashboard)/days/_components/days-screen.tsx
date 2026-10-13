'use client';

import { DAY_STATUS_LABELS, DayStatus } from '@predict/contracts';
import { watDate } from '@predict/domain';
import { Badge } from '@predict/ui/badge';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { DayStatusBadge } from '@/components/status-badges';
import { api } from '@/lib/api';
import { formatDay, formatNaira } from '@/lib/format';
import { useNow } from '@/lib/hooks';

const STATUSES = DayStatus.options;

export function DaysScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const leagueId = params.get('league') ?? '';
  const rawStatus = params.get('status') ?? '';
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as DayStatus)
    : '';
  const today = watDate(new Date(useNow(60_000)));

  const leagues = useQuery(api.admin.leagues.list.queryOptions());
  const days = useQuery(
    api.admin.days.list.queryOptions({
      input: { leagueId: leagueId || undefined, status: status || undefined },
    }),
  );

  function setFilter(key: 'league' | 'status', value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Contest"
        title="match-days"
        description="Each day has its own matches, settings, entries and prize pool. Create days from a league."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <Field label="League">
          <Select value={leagueId} onChange={(event) => setFilter('league', event.target.value)}>
            <option value="">All leagues</option>
            {leagues.data?.items.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {DAY_STATUS_LABELS[item]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <QueryState query={days}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="size-6" />}
              title="No match-days found"
              description={
                leagueId || status
                  ? 'Try another filter.'
                  : 'Open a league and pick its dates, or import its fixtures.'
              }
            />
          ) : (
            <Card className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>League</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Matches</TableHead>
                    <TableHead className="text-right">Paid entries</TableHead>
                    <TableHead className="text-right">Pool</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((day) => (
                    <TableRow
                      key={day.id}
                      className={cn('hover:bg-muted/40', day.date === today && 'bg-sg-flash/10')}
                    >
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/days/${day.id}`}
                          className="font-bold underline-offset-4 hover:underline"
                        >
                          {formatDay(day.date)}
                        </Link>
                        {day.date === today ? (
                          <Badge variant="accent" className="ml-2">
                            Today
                          </Badge>
                        ) : null}
                        {day.title ? (
                          <span className="block text-xs text-muted-foreground">{day.title}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{day.leagueName}</TableCell>
                      <TableCell>
                        <DayStatusBadge status={day.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{day.matchCount}</TableCell>
                      <TableCell className="text-right font-mono">{day.confirmedEntries}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNaira(day.dailyPoolKobo)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        }
      </QueryState>
    </div>
  );
}
