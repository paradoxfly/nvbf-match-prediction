'use client';

import type { DayStatus } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { DayStatusBadge } from '@/components/status-badges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { useTabParam } from '@/lib/hooks';
import { DayActions } from './day-actions';
import { DayPoolPanel } from './day-pool-panel';
import { LeaderboardTab } from './leaderboard-tab';
import { MatchesTab } from './matches-tab';
import { ResultsTab } from './results-tab';
import { SettingsTab } from './settings-tab';

const TABS = ['matches', 'settings', 'results', 'leaderboard'] as const;
const LIVE: DayStatus[] = ['open', 'closed'];
const HAS_RESULTS: DayStatus[] = ['open', 'closed', 'finalized', 'completed'];

const defaultTab = (status: DayStatus | undefined): (typeof TABS)[number] =>
  status === 'closed'
    ? 'results'
    : status === 'finalized' || status === 'completed'
      ? 'leaderboard'
      : 'matches';

export function DayScreen() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const day = useQuery(
    api.admin.days.get.queryOptions({
      input: { id },
      refetchInterval: (query) =>
        query.state.data && LIVE.includes(query.state.data.status) ? 20_000 : false,
    }),
  );
  const [tab, setTab] = useTabParam(TABS, defaultTab(day.data?.status));

  return (
    <div className="flex flex-col gap-6">
      <QueryState query={day} errorTitle="Could not load this match-day">
        {(data) => {
          const hasResults = HAS_RESULTS.includes(data.status);
          const activeTab =
            !hasResults && (tab === 'results' || tab === 'leaderboard') ? 'matches' : tab;
          return (
            <>
              <PageHeader
                back={{ href: '/days', label: 'Match-days' }}
                kicker={
                  <Link href={`/leagues/${data.leagueId}`} className="hover:underline">
                    {data.leagueName}
                  </Link>
                }
                title={formatDay(data.date).toLowerCase()}
                description={data.title ?? undefined}
                actions={
                  <>
                    {can(admin) ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/audit?targetType=match_day&targetId=${data.id}`}>
                          <History aria-hidden />
                          History
                        </Link>
                      </Button>
                    ) : null}
                    <DayStatusBadge status={data.status} />
                  </>
                }
              />
              <DayPoolPanel day={data} />
              <DayActions day={data} onShowTab={setTab} />
              <Tabs value={activeTab} onValueChange={setTab}>
                <TabsList aria-label="Match-day sections">
                  <TabsTrigger value="matches" count={data.matches.length}>
                    Matches
                  </TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="results" disabled={!hasResults}>
                    Results
                  </TabsTrigger>
                  <TabsTrigger value="leaderboard" disabled={!hasResults}>
                    Leaderboard &amp; finalize
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="matches">
                  <MatchesTab day={data} />
                </TabsContent>
                <TabsContent value="settings">
                  <SettingsTab day={data} />
                </TabsContent>
                <TabsContent value="results">
                  {hasResults ? <ResultsTab day={data} /> : null}
                </TabsContent>
                <TabsContent value="leaderboard">
                  {hasResults ? <LeaderboardTab day={data} /> : null}
                </TabsContent>
              </Tabs>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
