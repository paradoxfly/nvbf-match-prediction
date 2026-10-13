'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { ErrorAlert } from '@/components/error-alert';
import { QueryState } from '@/components/query-state';
import { TeamLogo } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { invalidate } from '@/lib/invalidate';
import type { League, TeamRef } from '@/lib/types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export function TeamsTab({ league }: { league: League }) {
  const teams = useQuery(api.admin.teams.list.queryOptions({ input: {} }));
  return (
    <QueryState query={teams}>
      {(data) => (
        <TeamsPicker
          key={league.teams.map((row) => row.team.id).join(',')}
          league={league}
          allTeams={data.items}
        />
      )}
    </QueryState>
  );
}

function TeamsPicker({ league, allTeams }: { league: League; allTeams: TeamRef[] }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const current = new Set(league.teams.map((row) => row.team.id));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(current));
  const canEdit = can(admin, 'operations') && league.status !== 'completed';
  const locked = league.status !== 'draft';

  const save = useMutation(
    api.admin.leagues.setTeams.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.leagues.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.list.key(), api.admin.standings.key());
        toast({ title: 'League teams saved' });
      },
    }),
  );

  // Teams already in the league stay listed even if archived since.
  const listed = new Map<string, TeamRef>(allTeams.map((team) => [team.id, team]));
  for (const row of league.teams) if (!listed.has(row.team.id)) listed.set(row.team.id, row.team);
  const archivedInLeague = new Set(
    league.teams
      .filter((row) => !allTeams.some((team) => team.id === row.team.id))
      .map((row) => row.team.id),
  );

  const added = [...selected].filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !selected.has(id));
  const dirty = added.length > 0 || removed.length > 0;

  function toggle(id: string, checked: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {locked ? (
        <Callout variant="info">
          The league is running: you can add teams, but teams already in it can&apos;t be removed.
        </Callout>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {CATEGORIES.map((category) => {
          const teams = [...listed.values()]
            .filter((team) => team.category === category)
            .sort((a, b) => a.name.localeCompare(b.name));
          const count = teams.filter((team) => selected.has(team.id)).length;
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle>
                  {CATEGORY_LABELS[category]}{' '}
                  <span className="font-mono text-sm text-muted-foreground">{count} selected</span>
                </CardTitle>
                <CardDescription>
                  {count === 1 ? 'A category needs at least two teams to play.' : null}
                </CardDescription>
              </CardHeader>
              {teams.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No {CATEGORY_LABELS[category].toLowerCase()}&apos;s teams yet.{' '}
                  <Link href="/teams" className="font-semibold underline">
                    Add teams
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {teams.map((team) => {
                    const inLeague = current.has(team.id);
                    const disabled = !canEdit || (locked && inLeague);
                    return (
                      <li key={team.id}>
                        <label
                          className={cn(
                            'flex items-center gap-3 py-2.5 text-sm',
                            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                          )}
                        >
                          <Checkbox
                            checked={selected.has(team.id)}
                            disabled={disabled}
                            onCheckedChange={(checked) => toggle(team.id, checked)}
                          />
                          <TeamLogo name={team.name} logoUrl={team.logoUrl} size="sm" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {team.shortName}
                          </span>
                          {archivedInLeague.has(team.id) ? (
                            <Badge variant="destructive">Archived</Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
      {archivedInLeague.size > 0 ? (
        <Callout variant="warning">
          A team in this league has been archived. Restore it in Teams before saving changes here.
        </Callout>
      ) : null}
      <ErrorAlert error={save.error} />
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {dirty ? (
            <span className="text-sm text-muted-foreground">
              {added.length > 0 ? `${added.length} to add` : ''}
              {added.length > 0 && removed.length > 0 ? ' · ' : ''}
              {removed.length > 0 ? `${removed.length} to remove` : ''}
            </span>
          ) : null}
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => setSelected(new Set(current))}
          >
            Reset
          </Button>
          <Button
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate({ id: league.id, teamIds: [...selected] })}
          >
            {save.isPending ? 'Saving…' : 'Save teams'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
