'use client';

import { CATEGORY_LABELS } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, PencilLine } from 'lucide-react';
import { can, useAdmin } from '@/components/admin-shell';
import { MatchStatusBadge, ResultStatusBadge } from '@/components/status-badges';
import { MatchTeams } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatTime } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { AdminDay, DayMatch, ResultVersion } from '@/lib/types';
import { useApplyDay } from './day-actions';
import { setLine, sortMatches } from './matches-tab';
import { ResultDialog } from './result-dialog';

export function ResultsTab({ day }: { day: AdminDay }) {
  const matches = sortMatches(day.matches);
  const editable = day.status === 'open' || day.status === 'closed';
  const pending = matches.filter((match) => match.status === 'scheduled').length;

  return (
    <div className="flex flex-col gap-4">
      <Callout variant="info">
        Enter each result as the league reports it, then confirm it. Only confirmed results count on
        the leaderboard. Whoever enters a result can also confirm it; correcting a confirmed result
        needs a super admin.
        {editable && pending > 0
          ? ` ${pending} of ${matches.length} matches still need a result.`
          : ''}
      </Callout>
      {matches.length === 0 ? (
        <EmptyState title="No matches on this day" />
      ) : (
        matches.map((match) => (
          <MatchResultCard key={match.id} day={day} match={match} editable={editable} />
        ))
      )}
    </div>
  );
}

function MatchResultCard({
  day,
  match,
  editable,
}: {
  day: AdminDay;
  match: DayMatch;
  editable: boolean;
}) {
  const admin = useAdmin();
  const toast = useToast();
  const queryClient = useQueryClient();
  const applyDay = useApplyDay(day.id);
  const versions = useQuery(
    api.admin.results.versions.queryOptions({
      input: { id: match.id },
      // Another admin may enter or confirm results while the day is live.
      refetchInterval: editable ? 30_000 : false,
    }),
  );
  const items = [...(versions.data?.items ?? [])].sort((a, b) => b.version - a.version);
  const provisional = items.find((item) => item.status === 'provisional') ?? null;
  const confirmed = items.find((item) => item.status === 'confirmed') ?? null;
  const hasConfirmed = Boolean(match.result) || confirmed !== null;
  const isOps = can(admin, 'operations');
  const isSuper = can(admin);
  const voided = match.status === 'void';

  const confirm = useMutation(
    api.admin.results.confirm.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        void invalidate(queryClient, api.admin.results.key());
        toast({ title: 'Result confirmed', description: 'It now counts on the leaderboard.' });
      },
    }),
  );

  const canEnter = editable && isOps && !voided && (!hasConfirmed || isSuper);
  const canConfirm = editable && isOps && provisional !== null && (!hasConfirmed || isSuper);
  const prefill = provisional?.sets ?? confirmed?.sets ?? match.result?.sets ?? null;

  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono font-bold text-foreground">
              {formatTime(match.scheduledAt)}
            </span>
            <Badge variant="muted">{CATEGORY_LABELS[match.category]}</Badge>
            <MatchStatusBadge status={match.status} />
          </p>
          <MatchTeams home={match.home} away={match.away} />
        </div>
        {match.result ? (
          <div className="text-right">
            <p className="font-mono text-2xl leading-none font-bold">
              {match.result.homeSets}–{match.result.awaySets}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{setLine(match.result.sets)}</p>
          </div>
        ) : voided ? (
          <p className="max-w-60 text-right text-sm text-muted-foreground">
            Void{match.voidReason ? `: ${match.voidReason}` : ''}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No confirmed result</p>
        )}
      </div>

      {provisional ? (
        <Callout variant="warning" title="Entered, not confirmed yet">
          <span>
            <span className="font-mono font-bold">
              {provisional.homeSets}–{provisional.awaySets}
            </span>{' '}
            <span className="font-mono">({setLine(provisional.sets)})</span> · entered by{' '}
            {provisional.enteredBy} {formatDateTime(provisional.createdAt)}
          </span>
          {provisional.nonStandardReason ? (
            <span>Unusual score: {provisional.nonStandardReason}</span>
          ) : null}
          {provisional.note ? <span>Note: {provisional.note}</span> : null}
        </Callout>
      ) : null}

      {canEnter || canConfirm ? (
        <div className="flex flex-wrap gap-2">
          {canConfirm && provisional ? (
            <ConfirmAction
              trigger={
                <Button size="sm">
                  <CircleCheck aria-hidden />
                  Confirm result
                </Button>
              }
              title="Confirm this result?"
              description={`${match.home.shortName} ${provisional.homeSets}–${provisional.awaySets} ${match.away.shortName} (${setLine(provisional.sets)}). It counts on the leaderboard straight away.${hasConfirmed ? ' It replaces the confirmed result.' : ''}`}
              confirmLabel="Confirm result"
              pendingLabel="Confirming…"
              onConfirm={() => confirm.mutateAsync({ id: match.id })}
            />
          ) : null}
          {canEnter ? (
            <ResultDialog
              day={day}
              match={match}
              prefill={prefill}
              correcting={hasConfirmed}
              trigger={
                <Button size="sm" variant={canConfirm ? 'outline' : 'default'}>
                  <PencilLine aria-hidden />
                  {hasConfirmed
                    ? 'Correct result'
                    : provisional
                      ? 'Re-enter result'
                      : 'Enter result'}
                </Button>
              }
            />
          ) : null}
        </div>
      ) : editable && hasConfirmed && isOps && !isSuper ? (
        <p className="text-xs text-muted-foreground">
          Only a super admin can correct a confirmed result.
        </p>
      ) : null}

      <details className="group">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground select-none hover:text-foreground">
          History{versions.data ? ` (${items.length})` : ''}
        </summary>
        <div className="mt-2">
          {versions.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : versions.isError ? (
            <p className="text-xs text-destructive">{errorMessage(versions.error)}</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No result entered yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border">
              {items.map((item) => (
                <VersionRow key={item.id} item={item} />
              ))}
            </ol>
          )}
        </div>
      </details>
    </Card>
  );
}

function VersionRow({ item }: { item: ResultVersion }) {
  return (
    <li className="flex flex-col gap-1 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-bold">v{item.version}</span>
        <span className="font-mono font-bold">
          {item.homeSets}–{item.awaySets}
        </span>
        <span className="font-mono text-muted-foreground">{setLine(item.sets)}</span>
        <ResultStatusBadge status={item.status} />
      </div>
      <p className="text-muted-foreground">
        Entered by {item.enteredBy} · {formatDateTime(item.createdAt)}
        {item.confirmedBy
          ? ` · confirmed by ${item.confirmedBy}${item.confirmedAt ? ` · ${formatDateTime(item.confirmedAt)}` : ''}`
          : ''}
      </p>
      {item.nonStandardReason ? (
        <p className="text-muted-foreground">Unusual score: {item.nonStandardReason}</p>
      ) : null}
      {item.note ? <p className="text-muted-foreground">Note: {item.note}</p> : null}
    </li>
  );
}
