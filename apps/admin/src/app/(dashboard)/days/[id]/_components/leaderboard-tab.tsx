'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { QueryState } from '@/components/query-state';
import { Callout } from '@/components/ui/callout';
import { CheckboxField } from '@/components/ui/checkbox';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatNaira, plural } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { AdminDay, Leaderboard } from '@/lib/types';

const PAGE = 100;

export function LeaderboardTab({ day }: { day: AdminDay }) {
  const live = day.status === 'open' || day.status === 'closed';
  const leaderboard = useQuery(
    api.admin.results.leaderboard.queryOptions({
      input: { id: day.id },
      refetchInterval: live ? 30_000 : false,
    }),
  );
  return (
    <QueryState query={leaderboard} errorTitle="Could not load the leaderboard">
      {(data) => <LeaderboardView day={day} board={data} />}
    </QueryState>
  );
}

function LeaderboardView({ day, board }: { day: AdminDay; board: Leaderboard }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? board.rows : board.rows.slice(0, PAGE);
  const scored = day.matches.filter((match) => match.status === 'final').length;
  const playable = day.matches.filter((match) => match.status !== 'void').length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label={board.day.pool.final ? 'Final pool' : 'Pool now'}
            value={formatNaira(board.allocation.dailyPoolKobo)}
            emphasis
          />
          <Stat label="Awarded" value={formatNaira(board.allocation.awardedKobo)} />
          <Stat label="Rounding to operations" value={formatNaira(board.allocation.roundingKobo)} />
          <Stat label="To the jackpot" value={formatNaira(board.allocation.jackpotCutKobo)} />
        </div>
        <p className="text-xs text-muted-foreground">
          {scored} of {playable} matches scored · {plural(board.rows.length, 'ranked player')}
          {board.unranked.length > 0 ? ` · ${board.unranked.length} paid but not ranked` : ''}
          {board.day.pool.final ? '' : ' · provisional until the day is final'}
        </p>
      </Card>

      <FinalizePanel day={day} board={board} />

      <Card className="p-0">
        <div className="px-5 pt-5">
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Ties are broken by closest set scores, then exact scores, then correct winners (as set
              for this day). Players still tied share their places&apos; prize money.
            </CardDescription>
          </CardHeader>
        </div>
        {board.rows.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">Nobody is ranked yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead
                  className="text-right"
                  title="Total set-score difference (lower is better)"
                >
                  Set diff
                </TableHead>
                <TableHead className="text-right">Exact</TableHead>
                <TableHead className="text-right">Winners</TableHead>
                <TableHead className="text-right">Counted picks</TableHead>
                <TableHead className="text-right">Prize</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.entryId}
                  className={cn(row.prizeKobo !== null && 'bg-sg-flash/10')}
                >
                  <TableCell className="font-mono font-bold whitespace-nowrap">
                    {row.tied ? '=' : ''}
                    {row.rank}
                  </TableCell>
                  <TableCell className="font-semibold">{row.displayName}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{row.points}</TableCell>
                  <TableCell className="text-right font-mono">{row.closeness}</TableCell>
                  <TableCell className="text-right font-mono">{row.exactCount}</TableCell>
                  <TableCell className="text-right font-mono">{row.winnerCount}</TableCell>
                  <TableCell className="text-right font-mono">{row.countedPredictions}</TableCell>
                  <TableCell className="text-right font-mono whitespace-nowrap">
                    {row.prizeKobo !== null ? formatNaira(row.prizeKobo) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {board.rows.length > PAGE ? (
          <div className="flex justify-center p-4">
            <Button variant="outline" size="sm" onClick={() => setShowAll((value) => !value)}>
              {showAll ? `Show the top ${PAGE}` : `Show all ${board.rows.length}`}
            </Button>
          </div>
        ) : null}
      </Card>

      {board.unranked.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Paid but not ranked</CardTitle>
            <CardDescription>
              Confirmed entries that don&apos;t qualify. Their fees stay in the pool.
            </CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {board.unranked.map((item) => (
              <li key={item.entryId} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="font-semibold">{item.displayName}</span>
                <span className="text-muted-foreground">{item.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function FinalizePanel({ day, board }: { day: AdminDay; board: Leaderboard }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const isSuper = can(admin);

  const apply = (data: Leaderboard) => {
    queryClient.setQueryData(
      api.admin.results.leaderboard.queryKey({ input: { id: day.id } }),
      data,
    );
    queryClient.setQueryData(api.admin.days.get.queryKey({ input: { id: day.id } }), data.day);
    void invalidate(
      queryClient,
      api.admin.days.list.key(),
      api.admin.leagues.key(),
      api.admin.payouts.key(),
      api.admin.jackpot.key(),
    );
  };
  const finalize = useMutation(
    api.admin.results.finalize.mutationOptions({
      onSuccess: (data) => {
        apply(data);
        toast({ title: 'Day finalized', description: 'Prizes are waiting in Payouts.' });
      },
    }),
  );
  const reopen = useMutation(
    api.admin.results.reopen.mutationOptions({
      onSuccess: (data) => {
        apply(data);
        toast({
          title: 'Day reopened',
          description: 'Prizes were withdrawn until it is final again.',
        });
      },
    }),
  );

  if (day.status === 'finalized' || day.status === 'completed') {
    return (
      <Card className="gap-3">
        <p className="flex items-center gap-2 font-bold">
          <Lock className="size-4" aria-hidden />
          {day.status === 'completed' ? 'Completed: every prize is paid' : 'Winners confirmed'}
        </p>
        {day.status === 'finalized' ? (
          <>
            <p className="text-sm text-muted-foreground">
              The pool is frozen and prizes are in Payouts. A mistake? Reopen the day before any
              payout starts.
            </p>
            {isSuper ? (
              <ConfirmAction
                trigger={
                  <Button variant="outline" className="w-fit">
                    <RotateCcw aria-hidden />
                    Reopen day
                  </Button>
                }
                title="Reopen this day?"
                description="Its prizes and jackpot share are withdrawn until you finalize again. Not possible once a payout has started."
                confirmLabel="Reopen day"
                pendingLabel="Reopening…"
                destructive
                reason={{ placeholder: 'e.g. Wrong result confirmed for match 3.' }}
                onConfirm={(reason) => reopen.mutateAsync({ id: day.id, reason })}
              />
            ) : null}
          </>
        ) : null}
      </Card>
    );
  }

  const { check } = board;
  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">Finalize checklist</p>
        {check.canFinalize ? (
          <Badge variant="success">Ready</Badge>
        ) : (
          <Badge variant="destructive">Blocked</Badge>
        )}
      </div>
      {check.blockers.length > 0 ? (
        <Callout variant="danger" title="Fix these first" items={check.blockers} />
      ) : null}
      {check.warnings.length > 0 ? (
        <>
          <Callout variant="warning" title="Check these" items={check.warnings} />
          <CheckboxField
            label="I've checked these"
            description="Finalizing goes ahead with these as they are."
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
          />
        </>
      ) : null}
      {check.blockers.length === 0 && check.warnings.length === 0 ? (
        <Callout variant="success">Every result is confirmed and every claim decided.</Callout>
      ) : null}
      {isSuper ? (
        <ConfirmAction
          trigger={
            <Button
              className="w-fit"
              disabled={!check.canFinalize || (check.warnings.length > 0 && !acknowledged)}
            >
              <Lock aria-hidden />
              Finalize day
            </Button>
          }
          title="Finalize this day?"
          description={`The pool freezes at ${formatNaira(board.allocation.dailyPoolKobo)}, ${plural(board.rows.filter((row) => row.prizeKobo !== null).length, 'prize')} go to Payouts and ${formatNaira(board.allocation.jackpotCutKobo)} goes to the jackpot. You can reopen only until a payout starts.`}
          confirmLabel="Finalize day"
          pendingLabel="Finalizing…"
          onConfirm={() =>
            finalize.mutateAsync({
              id: day.id,
              acknowledgeWarnings: check.warnings.length > 0 && acknowledged,
            })
          }
        />
      ) : (
        <p className="text-xs text-muted-foreground">Only a super admin can finalize a day.</p>
      )}
    </Card>
  );
}
