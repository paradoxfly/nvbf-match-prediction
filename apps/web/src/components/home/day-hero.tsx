'use client';

import { DAY_STATUS_LABELS } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { ArrowRightIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCountdown, formatDay, formatMoment, formatNaira } from '@/lib/format';
import type { DayData } from '@/lib/types';

const ON_NIGHT_BUTTON = 'bg-sg-chalk text-sg-night hover:bg-sg-chalk/85';

function HeroStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col-reverse gap-1">
      <dt className="font-mono text-[10px] font-medium tracking-[1px] text-sg-chalk/60 uppercase">
        {label}
      </dt>
      <dd className="truncate font-mono text-lg leading-none font-bold sm:text-xl">{value}</dd>
    </div>
  );
}

function DayCallToAction({ day, isToday }: { day: DayData; isToday: boolean }) {
  if (day.status === 'open') {
    return (
      <Button asChild size="lg" className={ON_NIGHT_BUTTON}>
        <Link href={`/play/${day.date}`}>
          {isToday ? 'Play today' : `Play ${formatDay(day.date)}`}
          <ArrowRightIcon aria-hidden />
        </Link>
      </Button>
    );
  }
  if (day.status === 'closed' || day.status === 'finalized' || day.status === 'completed') {
    return (
      <Button asChild size="lg" className={ON_NIGHT_BUTTON}>
        <Link href={`/leaderboard/${day.date}`}>
          See results
          <ArrowRightIcon aria-hidden />
        </Link>
      </Button>
    );
  }
  if (day.status === 'published') {
    return (
      <span className="inline-flex h-12 items-center rounded-full border border-sg-chalk/25 px-6 font-bold text-sg-chalk/80">
        Opens soon
      </span>
    );
  }
  return null;
}

function DeadlineLine({ day, now }: { day: DayData; now: number }) {
  if (day.status === 'open' && day.entryCutoff) {
    const left = new Date(day.entryCutoff).getTime() - now;
    return (
      <p className="flex items-center gap-2 text-sm text-sg-chalk/80">
        <ClockIcon aria-hidden className="size-4" />
        {left > 0 ? (
          <span>
            picks close in{' '}
            <time dateTime={day.entryCutoff} className="font-mono font-bold text-sg-chalk">
              {formatCountdown(left)}
            </time>
          </span>
        ) : (
          <span>Picks have closed for today.</span>
        )}
      </p>
    );
  }
  if (day.status === 'published' && day.opensAt) {
    return (
      <p className="flex items-center gap-2 text-sm text-sg-chalk/80">
        <ClockIcon aria-hidden className="size-4" />
        Opens {formatMoment(day.opensAt)}
      </p>
    );
  }
  return null;
}

/** The featured match-day on Night: the prize pool is the one Flash moment of the page. */
export function DayHero({ day, now, today }: { day: DayData; now: number; today: string }) {
  const { pool } = day;
  const isToday = day.date === today;
  const fromEntries = Math.max(0, pool.participantShareKobo - pool.jackpotCutKobo);

  return (
    <section
      aria-labelledby="pool-heading"
      className="overflow-hidden rounded-2xl bg-sg-night p-6 text-sg-chalk sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[2px] text-sg-chalk/60 uppercase">
          {formatDay(day.date)} · {DAY_STATUS_LABELS[day.status]}
        </p>
        <p className="truncate text-xs font-semibold text-sg-chalk/60">
          {day.title ?? day.leagueName}
        </p>
      </div>

      <h2 id="pool-heading" className="mt-6 text-sm font-bold text-sg-chalk/85">
        {isToday ? "today's prize pool" : `prize pool for ${formatDay(day.date)}`}
      </h2>
      <p className="mt-1 font-mono text-[clamp(2rem,11vw,4.5rem)] leading-none font-bold tracking-[-2px] text-sg-flash">
        {formatNaira(pool.dailyPoolKobo)}
      </p>
      <p className="mt-3 max-w-md text-xs text-sg-chalk/60">
        {day.status === 'cancelled'
          ? 'This day was cancelled. Everyone who paid gets a full refund.'
          : pool.final
            ? 'Prize pool confirmed.'
            : 'Grows as payments are confirmed. Fixed once the winners are confirmed.'}
      </p>
      {day.pledgedKobo > 0 ? (
        <p className="mt-1 text-xs text-sg-chalk/80">
          + {formatNaira(day.pledgedKobo)} potential sponsor money (not guaranteed)
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-sg-chalk/10 pt-5 sm:grid-cols-4">
        <HeroStat label="Paid players" value={pool.confirmedEntries.toLocaleString('en-NG')} />
        <HeroStat label="Entry fee" value={formatNaira(pool.entryFeeKobo)} />
        <HeroStat label="From entries" value={formatNaira(fromEntries)} />
        <HeroStat label="From sponsors" value={formatNaira(pool.contributionsKobo)} />
      </dl>

      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
        <DayCallToAction day={day} isToday={isToday} />
        <DeadlineLine day={day} now={now} />
      </div>
    </section>
  );
}
