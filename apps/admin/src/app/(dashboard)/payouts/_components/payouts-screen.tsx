'use client';

import type { ObligationKind, ObligationStatus } from '@predict/contracts';
import { ChoiceChips } from '@predict/ui/choice-chips';
import { EmptyState } from '@predict/ui/states';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { OBLIGATION_KIND_LABELS, OBLIGATION_STATUS_STAFF } from '@/components/status-badges';
import { Pager } from '@/components/ui/pager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { ObligationCard } from './obligation-card';

const STATUSES: ObligationStatus[] = [
  'awaiting_details',
  'ready',
  'processing',
  'paid',
  'details_invalid',
  'on_hold',
];
const KINDS: ObligationKind[] = ['prize', 'refund', 'jackpot'];
const PAGE_SIZE = 20;

const EMPTY_COPY: Record<ObligationStatus, string> = {
  awaiting_details: 'Nobody is waiting to add bank details.',
  ready: 'Nothing is ready to send.',
  processing: 'No transfers in progress.',
  paid: 'Nothing paid yet.',
  details_invalid: 'No bank details need fixing.',
  on_hold: 'Nothing on hold.',
};

export function PayoutsScreen() {
  const admin = useAdmin();
  if (!can(admin, 'finance')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Money" title="payouts & refunds" />
        <NoAccess what="payouts" />
      </div>
    );
  }
  return <PayoutsList />;
}

function PayoutsList() {
  const params = useSearchParams();
  const initial = params.get('status');
  const [status, setStatus] = useState<ObligationStatus>(
    STATUSES.includes(initial as ObligationStatus) ? (initial as ObligationStatus) : 'ready',
  );
  const [kind, setKind] = useState<ObligationKind | 'all'>('all');
  const [page, setPage] = useState(1);
  const kindInput = kind === 'all' ? undefined : kind;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Money"
        title="payouts & refunds"
        description="Everything we owe players: prizes, refunds and the jackpot. Check the name your bank shows before every transfer."
      />
      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value as ObligationStatus);
          setPage(1);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Payout status">
            {STATUSES.map((item) => (
              <StatusTab key={item} status={item} kind={kindInput} />
            ))}
          </TabsList>
          <ChoiceChips
            label="Kind"
            options={[
              { value: 'all', label: 'All' },
              ...KINDS.map((item) => ({ value: item, label: OBLIGATION_KIND_LABELS[item] })),
            ]}
            value={[kind]}
            onChange={(value) => {
              setKind(value);
              setPage(1);
            }}
          />
        </div>
        {STATUSES.map((item) => (
          <TabsContent key={item} value={item}>
            <ObligationList status={item} kind={kindInput} page={page} onPage={setPage} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function StatusTab({
  status,
  kind,
}: {
  status: ObligationStatus;
  kind: ObligationKind | undefined;
}) {
  const count = useQuery(
    api.admin.payouts.list.queryOptions({ input: { status, kind, page: 1, pageSize: 1 } }),
  );
  return (
    <TabsTrigger value={status} count={count.data?.total ?? null}>
      {OBLIGATION_STATUS_STAFF[status]}
    </TabsTrigger>
  );
}

function ObligationList({
  status,
  kind,
  page,
  onPage,
}: {
  status: ObligationStatus;
  kind: ObligationKind | undefined;
  page: number;
  onPage: (page: number) => void;
}) {
  const list = useQuery(
    api.admin.payouts.list.queryOptions({
      input: { status, kind, page, pageSize: PAGE_SIZE },
      placeholderData: keepPreviousData,
    }),
  );
  return (
    <QueryState query={list}>
      {(data) =>
        data.items.length === 0 ? (
          <EmptyState icon={<Wallet className="size-6" />} title={EMPTY_COPY[status]} />
        ) : (
          <div className={cn('flex flex-col gap-3', list.isPlaceholderData && 'opacity-60')}>
            {data.items.map((obligation) => (
              <ObligationCard key={obligation.id} obligation={obligation} />
            ))}
            <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={onPage} />
          </div>
        )
      }
    </QueryState>
  );
}
