'use client';

import { DAY_STATUS_LABELS } from '@predict/contracts';
import { datesBetween } from '@predict/domain';
import { cn } from '@predict/ui/utils';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { SectionTitle } from '@/components/ui/text';
import type { DayCardData } from '@/lib/types';

/** Longest stretch we lay out as chips (a league is about two weeks). */
const MAX_DAYS = 120;

const weekday = new Intl.DateTimeFormat('en-NG', { weekday: 'short', timeZone: 'UTC' });
const monthDay = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function dayHref(day: DayCardData): string | null {
  if (day.status === 'open' || day.status === 'published') return `/play/${day.date}`;
  if (day.status === 'closed' || day.status === 'finalized' || day.status === 'completed') {
    return `/leaderboard/${day.date}`;
  }
  return null;
}

function leagueDates(days: readonly DayCardData[]): string[] {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first || !last) return [];
  try {
    const all = datesBetween(first, last);
    return all.length <= MAX_DAYS ? all : days.map((day) => day.date);
  } catch {
    return days.map((day) => day.date);
  }
}

/** Every date of the league as a scrollable strip; dates without matches are rest days. */
export function LeagueCalendar({
  days,
  today,
  focusDate,
  leagueName,
}: {
  days: readonly DayCardData[];
  today: string;
  /** The date to scroll into view first, e.g. the featured day. Defaults to today. */
  focusDate?: string;
  leagueName: string | null;
}) {
  const stripRef = useRef<HTMLOListElement>(null);
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((day) => [day.date, day]));
  const dates = leagueDates(sorted);

  const focus = focusDate && byDate.has(focusDate) ? focusDate : today;

  // Start with the focused day in view, scrolling only the strip (never the page itself).
  useEffect(() => {
    const strip = stripRef.current;
    const target = strip?.querySelector<HTMLElement>('[data-focus="true"]');
    if (!strip || !target) return;
    strip.scrollLeft = target.offsetLeft - strip.clientWidth / 2 + target.clientWidth / 2;
  }, [focus, dates.length]);

  if (dates.length === 0) return null;

  return (
    <section aria-labelledby="calendar-heading" className="flex flex-col gap-3">
      <SectionTitle
        id="calendar-heading"
        title="league calendar"
        kicker={leagueName ?? undefined}
      />
      <ol
        ref={stripRef}
        className="relative -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0"
      >
        {dates.map((date) => {
          const day = byDate.get(date);
          const instant = new Date(`${date}T00:00:00Z`);
          const isToday = date === today;
          const href = day ? dayHref(day) : null;
          const label = day ? DAY_STATUS_LABELS[day.status] : 'Rest day';
          const chip = (
            <span
              className={cn(
                'flex h-full w-[4.75rem] flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center',
                isToday
                  ? 'border-sg-night bg-sg-night text-sg-chalk'
                  : day
                    ? 'border-border bg-card'
                    : 'border-dashed border-border text-muted-foreground',
                day?.status === 'cancelled' && 'opacity-60',
              )}
            >
              <span className="font-mono text-[10px] tracking-[1px] uppercase">
                {isToday ? 'Today' : weekday.format(instant)}
              </span>
              <span className="text-sm font-extrabold">{monthDay.format(instant)}</span>
              <span
                className={cn(
                  'text-[11px] leading-tight',
                  isToday ? 'text-sg-chalk/70' : 'text-muted-foreground',
                  day?.status === 'cancelled' && 'line-through',
                )}
              >
                {label}
              </span>
            </span>
          );
          return (
            <li
              key={date}
              className="shrink-0 snap-start"
              data-focus={date === focus ? 'true' : undefined}
            >
              {href ? (
                <Link
                  href={href}
                  aria-current={isToday ? 'date' : undefined}
                  className="block h-full rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  {chip}
                </Link>
              ) : (
                chip
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
