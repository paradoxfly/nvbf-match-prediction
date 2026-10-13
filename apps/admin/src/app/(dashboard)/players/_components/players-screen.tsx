'use client';

import { UserStatus } from '@predict/contracts';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Pager } from '@/components/ui/pager';
import { SwitchField } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { PlayerStatusBadge, SharedAccountBadge } from './player-badges';

const PAGE_SIZE = 25;

export function PlayersScreen() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(params.get('duplicates') === '1');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 350);

  const players = useQuery(
    api.admin.players.list.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        q: q || undefined,
        status: (UserStatus.options as readonly string[]).includes(status)
          ? (status as UserStatus)
          : undefined,
        // `false` would arrive as the string "false" (read as true): omit it instead.
        sharedAccountsOnly: duplicatesOnly ? true : undefined,
      },
      placeholderData: keepPreviousData,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="People"
        title="players"
        description="Everyone who signed up with their email. Players who share a payout bank account may be duplicate accounts."
      />
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Search" className="w-full sm:w-80">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              placeholder="Name, email or phone"
              className="pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </Field>
        <Field label="Status" className="w-40">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
        <SwitchField
          label="Possible duplicates"
          description="Only players sharing a bank account"
          checked={duplicatesOnly}
          onCheckedChange={(checked) => {
            setDuplicatesOnly(checked);
            setPage(1);
          }}
          className="pb-1"
        />
      </div>
      <QueryState query={players}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title={duplicatesOnly ? 'No shared bank accounts' : 'No players found'}
              description={
                duplicatesOnly
                  ? 'No two players use the same payout account.'
                  : 'Try another search.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Card className={cn('p-0', players.isPlaceholderData && 'opacity-60')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Paid / entries</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead>Last sign-in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((player) => (
                      <TableRow key={player.id} className="hover:bg-muted/40">
                        <TableCell>
                          <Link
                            href={`/players/${player.id}`}
                            className="font-bold underline-offset-4 hover:underline"
                          >
                            {player.displayName}
                          </Link>
                          <span className="block text-xs break-all text-muted-foreground">
                            {player.email}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {player.phone}
                          </span>
                          {player.sharedAccountWith.length > 0 ? (
                            <span className="mt-1 block">
                              <SharedAccountBadge others={player.sharedAccountWith} />
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <PlayerStatusBadge status={player.status} />
                          {player.statusReason ? (
                            <span className="mt-1 block max-w-48 text-xs text-muted-foreground">
                              {player.statusReason}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {player.confirmedEntries} / {player.entries}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {formatDateTime(player.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                          {formatDateTime(player.lastLoginAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
              <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
