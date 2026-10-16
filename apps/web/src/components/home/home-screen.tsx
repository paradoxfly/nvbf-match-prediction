'use client';

import { product } from '@predict/brand';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { EmptyState } from '@predict/ui/states';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightIcon, CalendarClockIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { FixtureList } from '@/components/fixtures';
import { QueryError } from '@/components/query-error';
import { useOptionalSession } from '@/components/session';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle } from '@/components/ui/text';
import { api } from '@/lib/api';
import { clockOffset, useServerNow } from '@/lib/clock';
import { formatDay, plural, watDate } from '@/lib/format';
import type { DayData, HomeData, PredictionData } from '@/lib/types';
import { DayHero } from './day-hero';
import { HowItWorks } from './how-it-works';
import { JackpotCard } from './jackpot-card';
import { LeagueCalendar } from './league-calendar';
import { PrizeTable } from './prize-table';
import { SponsorsStrip } from './sponsors-strip';

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading today's contest" className="flex flex-col gap-6">
      <Skeleton className="h-72 rounded-2xl bg-sg-night/90" />
      <Skeleton className="h-64" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

const NO_PICKS: ReadonlyMap<string, PredictionData> = new Map();

/** The signed-in player's saved picks for the day, by match id (empty for visitors). */
function useMyPicks(day: DayData | null): ReadonlyMap<string, PredictionData> {
  const { user } = useOptionalSession();
  const myDay = useQuery({
    ...api.entries.myDay.queryOptions({ input: { date: day?.date ?? '' } }),
    enabled: Boolean(user && day && day.matches.length > 0),
    retry: false,
  });
  const predictions = myDay.data?.predictions;
  return useMemo(
    () => (predictions ? new Map(predictions.map((pick) => [pick.matchId, pick])) : NO_PICKS),
    [predictions],
  );
}

function HomeContent({ data, offset }: { data: HomeData; offset: number }) {
  const now = useServerNow(offset);
  const today = watDate(new Date(now));
  const day = data.featured;
  const picks = useMyPicks(day);

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <h1 className="sr-only">
        {product.name}: {data.leagueName ?? 'daily volleyball predictions'}
      </h1>

      {day ? (
        <DayHero day={day} now={now} today={today} />
      ) : (
        <EmptyState
          icon={<CalendarClockIcon aria-hidden className="size-8" />}
          title="No match days yet"
          description={`${data.leagueName ?? 'The league'} has no match days published yet. Check back soon.`}
        />
      )}

      {day && day.matches.length > 0 ? (
        <section aria-labelledby="fixtures-heading" className="flex flex-col gap-4">
          <SectionTitle
            id="fixtures-heading"
            title={day.date === today ? "today's matches" : `matches · ${formatDay(day.date)}`}
            kicker={plural(day.matches.length, 'match', 'matches')}
            action={
              day.status === 'open' ? (
                <Button asChild>
                  <Link href={`/play/${day.date}`}>
                    {picks.size > 0 ? 'Edit picks' : 'Predict'}
                    <ArrowRightIcon aria-hidden />
                  </Link>
                </Button>
              ) : undefined
            }
          />
          <FixtureList matches={day.matches} now={now} picks={picks} />
        </section>
      ) : null}

      {data.jackpot || day ? (
        <div className="grid items-start gap-6 md:grid-cols-2">
          {data.jackpot ? <JackpotCard jackpot={data.jackpot} now={now} /> : null}
          {day ? <PrizeTable day={day} /> : null}
        </div>
      ) : null}

      <LeagueCalendar
        days={data.days}
        today={today}
        focusDate={day?.date}
        leagueName={data.leagueName}
      />

      {day ? <SponsorsStrip sponsors={day.sponsors} /> : null}

      <HowItWorks
        entryFeeKobo={day?.settings.entryFeeKobo ?? null}
        places={day?.settings.prizeTiersBps.length ?? null}
        standingsPublic={data.standingsPublic}
      />
    </div>
  );
}

/** Today's contest: the prize pool and fixtures first, then the jackpot, prizes and calendar. */
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
