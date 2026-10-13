'use client';

import { product } from '@predict/brand';
import { Alert } from '@predict/ui/alert';
import { EmptyState } from '@predict/ui/states';
import { useQuery } from '@tanstack/react-query';
import { CalendarClockIcon } from 'lucide-react';
import Link from 'next/link';
import { FixtureList } from '@/components/fixtures';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle } from '@/components/ui/text';
import { api } from '@/lib/api';
import { clockOffset, useServerNow } from '@/lib/clock';
import { formatDay, plural, watDate } from '@/lib/format';
import type { HomeData } from '@/lib/types';
import { DayHero } from './day-hero';
import { HowItWorks } from './how-it-works';
import { JackpotCard } from './jackpot-card';
import { LeagueCalendar } from './league-calendar';
import { PrizeTable } from './prize-table';
import { SponsorsStrip } from './sponsors-strip';

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading today's contest" className="flex flex-col gap-6">
      <Skeleton className="h-24" />
      <Skeleton className="h-80 rounded-2xl bg-sg-night/90" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

function HomeContent({ data, offset }: { data: HomeData; offset: number }) {
  const now = useServerNow(offset);
  const today = watDate(new Date(now));
  const day = data.featured;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">
        {product.name}: {data.leagueName ?? 'daily volleyball predictions'}
      </h1>

      <LeagueCalendar
        days={data.days}
        today={today}
        focusDate={day?.date}
        leagueName={data.leagueName}
      />

      {day ? (
        <DayHero day={day} now={now} today={today} />
      ) : (
        <EmptyState
          icon={<CalendarClockIcon aria-hidden className="size-8" />}
          title="No match days yet"
          description={`${data.leagueName ?? 'The league'} has no match days published yet. Check back soon.`}
        />
      )}

      {data.jackpot || day ? (
        <div className="grid items-start gap-6 md:grid-cols-2">
          {data.jackpot ? <JackpotCard jackpot={data.jackpot} now={now} /> : null}
          {day ? <PrizeTable day={day} /> : null}
        </div>
      ) : null}

      {day && day.matches.length > 0 ? (
        <section aria-labelledby="fixtures-heading" className="flex flex-col gap-4">
          <SectionTitle
            id="fixtures-heading"
            title={day.date === today ? "today's matches" : `matches · ${formatDay(day.date)}`}
            kicker={plural(day.matches.length, 'match', 'matches')}
            action={
              day.status === 'open' ? (
                <Link
                  href={`/play/${day.date}`}
                  className="font-semibold underline underline-offset-4"
                >
                  Make your picks
                </Link>
              ) : undefined
            }
          />
          <FixtureList matches={day.matches} now={now} />
        </section>
      ) : null}

      {day ? <SponsorsStrip sponsors={day.sponsors} /> : null}

      <HowItWorks
        entryFeeKobo={day?.settings.entryFeeKobo ?? null}
        places={day?.settings.prizeTiersBps.length ?? null}
        standingsPublic={data.standingsPublic}
      />
    </div>
  );
}

/** Today's contest: the league calendar, prize pool, jackpot, prizes and fixtures. */
export function HomeScreen() {
  const home = useQuery(api.public.home.queryOptions({ refetchInterval: 15_000 }));

  if (!home.data) {
    if (home.isError) {
      return <QueryError error={home.error} onRetry={() => void home.refetch()} />;
    }
    return <HomeSkeleton />;
  }

  if (!home.data.leagueName && !home.data.featured) {
    return (
      <div className="flex flex-col gap-10">
        <h1 className="sr-only">{product.name}</h1>
        <EmptyState
          icon={<CalendarClockIcon aria-hidden className="size-8" />}
          title="The next league is on its way"
          description="There is no contest running right now. Check back soon, and read how it works in the meantime."
        />
        <HowItWorks entryFeeKobo={null} places={null} standingsPublic={false} />
      </div>
    );
  }

  return (
    <>
      {home.isError ? (
        <Alert className="mb-4">
          We couldn&apos;t refresh just now, so these numbers may be a little out of date.
        </Alert>
      ) : null}
      <HomeContent data={home.data} offset={clockOffset(home.data.serverNow, home.dataUpdatedAt)} />
    </>
  );
}
