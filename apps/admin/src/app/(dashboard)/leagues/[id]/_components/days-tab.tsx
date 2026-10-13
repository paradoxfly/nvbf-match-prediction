'use client';

import { DAY_STATUS_LABELS } from '@predict/contracts';
import { datesBetween } from '@predict/domain';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { ErrorAlert } from '@/components/error-alert';
import { DayStatusBadge } from '@/components/status-badges';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDay, formatNaira, plural } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { League, LeagueDayCard } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DAYS_PER_REQUEST = 60;

function leagueDates(league: League): string[] {
  try {
    return datesBetween(league.startDate, league.endDate);
  } catch {
    return [];
  }
}

/** Monday-first weekday index of a YYYY-MM-DD date. */
const weekdayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export function DaysTab({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = can(admin, 'operations') && league.status !== 'completed';
  const dates = leagueDates(league);
  const byDate = new Map(league.days.map((day) => [day.date, day]));
  const free = dates.filter((date) => !byDate.has(date));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const chosen = [...selected].filter((date) => !byDate.has(date)).sort();

  const createDays = useMutation(
    api.admin.leagues.createDays.mutationOptions({
      onSuccess: async (result) => {
        setSelected(new Set());
        await invalidate(queryClient, api.admin.leagues.key(), api.admin.days.key());
        toast({
          title: `${plural(result.created, 'match-day')} created`,
          description:
            result.skipped.length > 0
              ? `Skipped (already there): ${result.skipped.map(formatDay).join(', ')}`
              : 'They start as drafts with the league’s default settings.',
        });
      },
    }),
  );

  function toggle(date: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const leading = dates[0] ? weekdayIndex(dates[0]) : 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>
              Pick the dates that have matches and create them as draft days. Leave rest days
              unpicked. You can also create days by importing fixtures.
            </CardDescription>
          </CardHeader>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={free.length === 0}
                onClick={() => setSelected(new Set(free))}
              >
                Select all free dates
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={chosen.length === 0}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="group" aria-label="League dates">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              aria-hidden
              className="text-center font-mono text-[10px] tracking-[2px] text-muted-foreground uppercase"
            >
              {weekday}
            </div>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <div key={`blank-${index}`} aria-hidden />
          ))}
          {dates.map((date) => {
            const day = byDate.get(date);
            const dayNumber = Number(date.slice(8, 10));
            const month = new Date(`${date}T00:00:00Z`).toLocaleString('en-NG', {
              month: 'short',
              timeZone: 'UTC',
            });
            if (day) {
              return (
                <Link
                  key={date}
                  href={`/days/${day.id}`}
                  title={`${formatDay(date)} · ${DAY_STATUS_LABELS[day.status]}`}
                  className="flex min-h-16 flex-col justify-between rounded-sm bg-sg-night p-1.5 text-white outline-none hover:bg-sg-night/85 focus-visible:ring-3 focus-visible:ring-ring/60 sm:p-2"
                >
                  <span className="font-mono text-sm font-bold">
                    {dayNumber}
                    <span className="ml-1 hidden text-[10px] font-normal text-white/60 sm:inline">
                      {month}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[9px] tracking-[1px] text-sg-flash uppercase">
                    {DAY_STATUS_LABELS[day.status]}
                  </span>
                </Link>
              );
            }
            const isSelected = selected.has(date);
            return (
              <button
                key={date}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${formatDay(date)}${isSelected ? ', selected' : ''}`}
                disabled={!canEdit}
                onClick={() => toggle(date)}
                className={cn(
                  'flex min-h-16 flex-col justify-between rounded-sm border p-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-default sm:p-2',
                  isSelected
                    ? 'border-sg-night bg-sg-flash/40'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                <span className="font-mono text-sm font-bold">
                  {dayNumber}
                  <span className="ml-1 hidden text-[10px] font-normal text-muted-foreground sm:inline">
                    {month}
                  </span>
                </span>
                {isSelected ? (
                  <Check className="size-3.5" aria-hidden />
                ) : (
                  <span className="font-mono text-[9px] tracking-[1px] text-muted-foreground uppercase">
                    Free
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <ErrorAlert error={createDays.error} />
        {canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {chosen.length > MAX_DAYS_PER_REQUEST ? (
              <span className="text-sm text-destructive">
                Create at most {MAX_DAYS_PER_REQUEST} days at a time.
              </span>
            ) : null}
            <Button
              disabled={
                chosen.length === 0 || chosen.length > MAX_DAYS_PER_REQUEST || createDays.isPending
              }
              onClick={() => createDays.mutate({ id: league.id, dates: chosen })}
            >
              <CalendarPlus aria-hidden />
              {createDays.isPending
                ? 'Creating…'
                : chosen.length > 0
                  ? `Create ${plural(chosen.length, 'day')}`
                  : 'Create selected days'}
            </Button>
          </div>
        ) : null}
      </Card>

      <DayList days={league.days} />
    </div>
  );
}

function DayList({ days }: { days: LeagueDayCard[] }) {
  if (days.length === 0) {
    return (
      <EmptyState
        title="No match-days yet"
        description="Pick dates in the calendar above, or import the fixture list."
      />
    );
  }
  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Matches</TableHead>
            <TableHead className="text-right">Paid entries</TableHead>
            <TableHead className="text-right">Pool</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.id} className="hover:bg-muted/40">
              <TableCell>
                <Link
                  href={`/days/${day.id}`}
                  className="font-bold underline-offset-4 hover:underline"
                >
                  {formatDay(day.date)}
                </Link>
                {day.title ? (
                  <span className="block text-xs text-muted-foreground">{day.title}</span>
                ) : null}
              </TableCell>
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
  );
}
