'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, ShieldOff, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { EntryStatusBadge } from '@/components/status-badges';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Stat } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDateTime, formatDay } from '@/lib/format';
import { PlayerStatusBadge } from '../../_components/player-badges';

export function PlayerScreen() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const toast = useToast();
  const queryClient = useQueryClient();
  const player = useQuery(api.admin.players.get.queryOptions({ input: { id } }));
  const setStatus = useMutation(
    api.admin.players.setStatus.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(api.admin.players.get.queryKey({ input: { id } }), data);
        void queryClient.invalidateQueries({ queryKey: api.admin.players.list.key() });
        toast({
          title: data.status === 'suspended' ? 'Player suspended' : 'Player reinstated',
          description: data.status === 'suspended' ? 'They were signed out everywhere.' : undefined,
        });
      },
    }),
  );
  const isSuper = can(admin);
  const finance = can(admin, 'finance');

  return (
    <div className="flex flex-col gap-6">
      <QueryState query={player} errorTitle="Could not load this player">
        {(data) => (
          <>
            <PageHeader
              back={{ href: '/players', label: 'Players' }}
              kicker="Player"
              title={data.displayName}
              description={`${data.email} · ${data.phone}`}
              actions={
                <>
                  {isSuper ? (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/audit?targetType=user&targetId=${data.id}`}>
                        <History aria-hidden />
                        History
                      </Link>
                    </Button>
                  ) : null}
                  <PlayerStatusBadge status={data.status} />
                </>
              }
            />

            {data.sharedAccountWith.length > 0 ? (
              <Callout variant="danger" title="Shares a payout bank account">
                <span>
                  The same account is saved by{' '}
                  {data.sharedAccountWith.map((other, index) => (
                    <span key={other.id}>
                      {index > 0 ? ', ' : ''}
                      <Link href={`/players/${other.id}`} className="font-semibold underline">
                        {other.displayName}
                      </Link>
                    </span>
                  ))}
                  . Duplicate accounts break the one-entry rule: check before paying any prize.
                </span>
              </Callout>
            ) : null}

            {data.status === 'suspended' && data.statusReason ? (
              <Callout variant="warning" title="Suspended">
                {data.statusReason}
              </Callout>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Entries" value={data.entries} />
                  <Stat label="Paid entries" value={data.confirmedEntries} />
                  <Stat
                    label="Joined"
                    value={<span className="text-sm">{formatDateTime(data.createdAt)}</span>}
                  />
                  <Stat
                    label="Last sign-in"
                    value={<span className="text-sm">{formatDateTime(data.lastLoginAt)}</span>}
                  />
                </div>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Account</CardTitle>
                  <CardDescription>
                    {data.status === 'suspended'
                      ? 'Suspended players can’t sign in or enter.'
                      : 'Suspending signs the player out everywhere and stops new entries.'}
                  </CardDescription>
                </CardHeader>
                {isSuper ? (
                  data.status === 'suspended' ? (
                    <ConfirmAction
                      trigger={
                        <Button variant="outline" className="w-fit">
                          <UserCheck aria-hidden />
                          Reinstate player
                        </Button>
                      }
                      title={`Reinstate ${data.displayName}?`}
                      description="They can sign in and enter again."
                      confirmLabel="Reinstate"
                      pendingLabel="Saving…"
                      reason
                      onConfirm={(reason) =>
                        setStatus.mutateAsync({ id: data.id, status: 'active', reason })
                      }
                    />
                  ) : (
                    <ConfirmAction
                      trigger={
                        <Button variant="destructive" className="w-fit">
                          <ShieldOff aria-hidden />
                          Suspend player
                        </Button>
                      }
                      title={`Suspend ${data.displayName}?`}
                      description="They are signed out on every device and can't sign in or enter until reinstated. Existing entries and prizes are not changed: disqualify entries from Payments if needed."
                      confirmLabel="Suspend player"
                      pendingLabel="Suspending…"
                      destructive
                      reason
                      onConfirm={(reason) =>
                        setStatus.mutateAsync({ id: data.id, status: 'suspended', reason })
                      }
                    />
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Only a super admin can suspend players.
                  </p>
                )}
              </Card>
            </div>

            <Card className="p-0">
              <div className="px-5 pt-5">
                <CardHeader>
                  <CardTitle>Entries</CardTitle>
                  <CardDescription>One entry per match-day they joined.</CardDescription>
                </CardHeader>
              </div>
              {data.entryHistory.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted-foreground">No entries yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...data.entryHistory]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((entry) => (
                        <TableRow key={entry.entryId}>
                          <TableCell className="whitespace-nowrap">
                            {formatDay(entry.date)}
                          </TableCell>
                          <TableCell>
                            {finance ? (
                              <Link
                                href={`/payments?q=${encodeURIComponent(entry.paymentReference)}`}
                                className="font-mono font-bold tracking-[1px] underline-offset-4 hover:underline"
                              >
                                {entry.paymentReference}
                              </Link>
                            ) : (
                              <span className="font-mono font-bold tracking-[1px]">
                                {entry.paymentReference}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="flex flex-wrap gap-1">
                              <EntryStatusBadge status={entry.status} />
                              {entry.disqualified ? (
                                <Badge variant="destructive">Disqualified</Badge>
                              ) : null}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </QueryState>
    </div>
  );
}
