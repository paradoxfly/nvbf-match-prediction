'use client';

import { EntryStatus } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { ENTRY_STATUS_STAFF, EntryStatusBadge } from '@/components/status-badges';
import { Pager } from '@/components/ui/pager';
import { api } from '@/lib/api';
import { formatDateTime, formatDay, formatNaira, formatShortDay } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import type { PaymentItem } from '@/lib/types';
import { EntrySheet } from './entry-sheet';
import { PaymentsNav } from './payments-nav';

const PAGE_SIZE = 25;
/** A cell that stacks inside a card-like row on phones and is a normal cell from md up. */
const STACK = 'block py-0 md:table-cell md:py-3';

export function PaymentsScreen() {
  const admin = useAdmin();
  if (!can(admin, 'finance')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Money" title="payments" />
        <NoAccess what="payments" />
      </div>
    );
  }
  return <PaymentsQueue />;
}

function PaymentsQueue() {
  const params = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const initialStatus = params.get('status');
  const [status, setStatus] = useState<string>(
    initialStatus !== null ? initialStatus : initialQ ? '' : 'payment_review',
  );
  const [dayId, setDayId] = useState(params.get('day') ?? '');
  const [search, setSearch] = useState(initialQ);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<PaymentItem | null>(null);
  const q = useDebounced(search.trim(), 350);

  const days = useQuery(api.admin.days.list.queryOptions({ input: {} }));
  const queue = useQuery(
    api.admin.payments.queue.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        status: (EntryStatus.options as readonly string[]).includes(status)
          ? (status as EntryStatus)
          : undefined,
        dayId: dayId || undefined,
        q: q || undefined,
      },
      placeholderData: keepPreviousData,
      refetchInterval: 30_000,
    }),
  );
  const dayOptions = [...(days.data?.items ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Money"
        title="payments"
        description="Match each entry to its transfer on the bank statement. An entry counts only once its payment is confirmed."
        actions={<PaymentsNav />}
      />
      <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,16rem)_minmax(0,1fr)]">
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Any status</option>
            {EntryStatus.options.map((item) => (
              <option key={item} value={item}>
                {ENTRY_STATUS_STAFF[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Match-day">
          <Select
            value={dayId}
            onChange={(event) => {
              setDayId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All days</option>
            {dayOptions.map((day) => (
              <option key={day.id} value={day.id}>
                {formatDay(day.date)} · {day.leagueName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              placeholder="Reference, player, email, phone or sender"
              className="pl-9"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </Field>
      </div>

      <QueryState query={queue}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title={
                status === 'payment_review' && !q && !dayId ? 'No claims to check' : 'Nothing found'
              }
              description={
                status === 'payment_review' && !q && !dayId
                  ? 'New claims appear here when players say they have paid.'
                  : 'Try another status, day or search.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Card className={cn('p-0', queue.isPlaceholderData && 'opacity-60')}>
                <Table>
                  <TableHeader className="hidden md:table-header-group">
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Day</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Claim</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((item) => (
                      <TableRow
                        key={item.entryId}
                        className="flex cursor-pointer flex-col gap-1.5 py-3 hover:bg-muted/40 md:table-row md:py-0"
                        onClick={() => setSelected(item)}
                      >
                        <TableCell className={STACK}>
                          <button
                            type="button"
                            className="font-mono font-bold tracking-[1px] underline-offset-4 hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelected(item);
                            }}
                          >
                            {item.paymentReference}
                          </button>
                          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle md:hidden">
                            <EntryStatusBadge status={item.status} />
                            {item.disqualified ? (
                              <Badge variant="destructive">Disqualified</Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className={STACK}>
                          <span className="block font-semibold">{item.user.displayName}</span>
                          <span className="block text-xs break-all text-muted-foreground">
                            {item.user.email}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {item.user.phone}
                          </span>
                        </TableCell>
                        <TableCell className={cn(STACK, 'text-xs whitespace-nowrap md:text-sm')}>
                          {formatShortDay(item.day.date)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="flex flex-wrap gap-1">
                            <EntryStatusBadge status={item.status} />
                            {item.disqualified ? (
                              <Badge variant="destructive">Disqualified</Badge>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell className={cn(STACK, 'md:min-w-48')}>
                          {item.latestClaim ? (
                            <span className="flex flex-col text-xs">
                              <span className="font-semibold text-foreground">
                                {item.latestClaim.senderName}
                              </span>
                              <span
                                className={cn(
                                  'font-mono',
                                  item.latestClaim.amountKobo !== item.feeKobo &&
                                    'font-bold text-destructive',
                                )}
                              >
                                {formatNaira(item.latestClaim.amountKobo)}
                                {item.latestClaim.amountKobo !== item.feeKobo
                                  ? ` (fee ${formatNaira(item.feeKobo)})`
                                  : ''}
                              </span>
                              <span className="text-muted-foreground">
                                {formatDateTime(item.latestClaim.paidAt)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">No claim</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                          {formatDateTime(item.createdAt)}
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

      <EntrySheet item={selected} onChange={setSelected} onClose={() => setSelected(null)} />
    </div>
  );
}
