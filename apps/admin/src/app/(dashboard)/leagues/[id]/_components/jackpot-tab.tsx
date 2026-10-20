'use client';

import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import { can, useAdmin } from '@/components/admin-shell';
import { QueryState } from '@/components/query-state';
import { JackpotStatusBadge } from '@/components/status-badges';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDateTime, formatNaira, formatWat, ordinal } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { League } from '@/lib/types';

export function JackpotTab({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const jackpot = useQuery(api.admin.jackpot.get.queryOptions({ input: { id: league.id } }));
  const settle = useMutation(
    api.admin.jackpot.settle.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.jackpot.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.key(), api.admin.payouts.key());
        toast({
          title: data.winner ? `Jackpot won by ${data.winner.displayName}` : 'Jackpot settled',
          description: data.winner ? 'The prize is now in Payouts.' : undefined,
        });
      },
    }),
  );

  return (
    <QueryState query={jackpot} errorTitle="Could not load the jackpot">
      {(data) => {
        const settled = data.status === 'settled' || data.status === 'carried_over';
        return (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardHeader>
                  <CardTitle>League jackpot</CardTitle>
                  <CardDescription>Entries close {formatWat(data.entryClosesAt)}</CardDescription>
                </CardHeader>
                <JackpotStatusBadge status={data.status} />
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="From match-days" value={formatNaira(data.amounts.fromDaysKobo)} />
                <Stat
                  label="Sponsors & top-ups"
                  value={formatNaira(data.amounts.contributionsKobo)}
                />
                <Stat
                  label={data.amounts.finalKobo !== null ? 'Final amount' : 'Total so far'}
                  value={formatNaira(data.amounts.finalKobo ?? data.amounts.totalKobo)}
                  emphasis
                />
                <Stat
                  label="Entries"
                  value={`${data.eligibleEntries.toLocaleString('en-NG')} / ${data.entries.toLocaleString('en-NG')}`}
                  hint="Eligible (paid a daily entry in this league) / all"
                />
              </div>
            </Card>

            {data.winner ? (
              <Card className="flex-row items-center gap-4 bg-sg-night text-white">
                <Trophy className="size-8 shrink-0 text-sg-flash" aria-hidden />
                <div className="flex flex-col gap-1">
                  <p className="font-mono text-[10px] tracking-[2px] text-white/60 uppercase">
                    Winner
                  </p>
                  <p className="text-xl font-black">{data.winner.displayName}</p>
                  <p className="text-sm text-white/80">
                    {formatNaira(data.winner.amountKobo)} · {data.winner.distance}{' '}
                    {data.winner.distance === 1 ? 'place' : 'places'} off
                  </p>
                </div>
              </Card>
            ) : null}

            {!settled && data.blockers.length > 0 ? (
              <Callout variant="warning" title="Not ready to settle" items={data.blockers} />
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{settled ? 'Final ranking' : 'Provisional top 10'}</CardTitle>
                <CardDescription>
                  Distance is the total number of places off across both tables (0 is perfect). Ties
                  go to whoever last changed their prediction first.
                </CardDescription>
              </CardHeader>
              {data.preview.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No eligible predictions to rank yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Place</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead>Last saved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.preview.map((row) => (
                      <TableRow key={`${row.position}-${row.displayName}`}>
                        <TableCell className="font-mono font-bold">
                          {ordinal(row.position)}
                        </TableCell>
                        <TableCell className="font-semibold">{row.displayName}</TableCell>
                        <TableCell className="text-right font-mono">{row.distance}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(row.submittedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            {!settled && can(admin) ? (
              <div className="flex justify-end">
                <ConfirmAction
                  trigger={
                    <Button disabled={data.blockers.length > 0}>
                      <Trophy aria-hidden />
                      Settle jackpot
                    </Button>
                  }
                  title="Settle the jackpot?"
                  description="The winner is picked from the final standings and we record what we owe them. If nobody is eligible the jackpot carries over to the next league. This can't be undone."
                  confirmLabel="Settle jackpot"
                  pendingLabel="Settling…"
                  onConfirm={() => settle.mutateAsync({ id: league.id })}
                />
              </div>
            ) : null}
          </div>
        );
      }}
    </QueryState>
  );
}
