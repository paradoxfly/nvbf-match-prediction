'use client';

import { Button } from '@predict/ui/button';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { LeagueStatusBadge } from '@/components/status-badges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useTabParam } from '@/lib/hooks';
import { DaysTab } from './days-tab';
import { FixturesTab } from './fixtures-tab';
import { JackpotTab } from './jackpot-tab';
import { OverviewTab } from './overview-tab';
import { StandingsTab } from './standings-tab';
import { TeamsTab } from './teams-tab';

const TABS = ['overview', 'teams', 'days', 'fixtures', 'standings', 'jackpot'] as const;

export function LeagueScreen() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const [tab, setTab] = useTabParam(TABS, 'overview');
  const league = useQuery(api.admin.leagues.get.queryOptions({ input: { id } }));

  return (
    <div className="flex flex-col gap-6">
      <QueryState query={league} errorTitle="Could not load this league">
        {(data) => (
          <>
            <PageHeader
              back={{ href: '/leagues', label: 'Leagues' }}
              kicker="League"
              title={data.name}
              description={`${formatDay(data.startDate)} – ${formatDay(data.endDate)}`}
              actions={
                <>
                  {can(admin) ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/audit?targetType=league&targetId=${data.id}`}>
                        <History aria-hidden />
                        History
                      </Link>
                    </Button>
                  ) : null}
                  <LeagueStatusBadge status={data.status} />
                </>
              }
            />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList aria-label="League sections">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="teams" count={data.teams.length}>
                  Teams
                </TabsTrigger>
                <TabsTrigger value="days" count={data.days.length}>
                  Days
                </TabsTrigger>
                <TabsTrigger value="fixtures">Fixtures import</TabsTrigger>
                <TabsTrigger value="standings">Standings</TabsTrigger>
                <TabsTrigger value="jackpot">Jackpot</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <OverviewTab league={data} />
              </TabsContent>
              <TabsContent value="teams">
                <TeamsTab league={data} />
              </TabsContent>
              <TabsContent value="days">
                <DaysTab league={data} />
              </TabsContent>
              <TabsContent value="fixtures">
                <FixturesTab league={data} />
              </TabsContent>
              <TabsContent value="standings">
                <StandingsTab league={data} />
              </TabsContent>
              <TabsContent value="jackpot">
                <JackpotTab league={data} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </QueryState>
    </div>
  );
}
