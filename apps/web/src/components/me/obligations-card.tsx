'use client';

import { OBLIGATION_STATUS_LABELS, type ObligationStatus } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { useQuery } from '@tanstack/react-query';
import { BanknoteIcon } from 'lucide-react';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker } from '@/components/ui/text';
import { api } from '@/lib/api';
import { formatMoment, formatNaira, ordinal } from '@/lib/format';
import type { ObligationData } from '@/lib/types';

const KIND_LABELS: Record<ObligationData['kind'], string> = {
  prize: 'Prize',
  refund: 'Refund',
  jackpot: 'Jackpot',
};

const STATUS_VARIANTS: Record<ObligationStatus, 'success' | 'destructive' | 'default' | 'muted'> = {
  awaiting_details: 'destructive',
  details_invalid: 'destructive',
  ready: 'default',
  processing: 'default',
  paid: 'success',
  on_hold: 'muted',
};

/** The prominent "add your bank details" nudge, shown only when a payment is waiting on them. */
export function BankDetailsNudge() {
  const query = useQuery(api.payouts.myObligations.queryOptions());
  const waiting = (query.data?.items ?? []).filter(
    (item) => item.status === 'awaiting_details' || item.status === 'details_invalid',
  );
  if (waiting.length === 0) return null;
  const total = waiting.reduce((sum, item) => sum + item.amountKobo, 0);
  const invalid = waiting.some((item) => item.status === 'details_invalid');
  return (
    <section
      aria-label="Action needed"
      className="flex flex-col gap-4 rounded-lg bg-sg-night p-5 text-sg-chalk sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <BanknoteIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-extrabold">
            {invalid
              ? 'Check your bank details so we can pay you'
              : `We owe you ${formatNaira(total)}. Add your bank details to get paid.`}
          </p>
          <p className="text-sm text-sg-chalk/75">
            We pay by bank transfer to an account in your name.
          </p>
        </div>
      </div>
      <Button asChild className="shrink-0 bg-sg-chalk text-sg-night hover:bg-sg-chalk/85">
        <a href="#bank-details">{invalid ? 'Update bank details' : 'Add bank details'}</a>
      </Button>
    </section>
  );
}

function ObligationRow({ item }: { item: ObligationData }) {
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-bold">
            {KIND_LABELS[item.kind]}
            {item.kind === 'prize' && item.rank !== null ? ` · ${ordinal(item.rank)} place` : ''}
          </span>
          <span className="truncate text-xs text-muted-foreground">{item.label}</span>
        </div>
        <span className="shrink-0 font-mono text-base font-bold">
          {formatNaira(item.amountKobo)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANTS[item.status]}>
          {OBLIGATION_STATUS_LABELS[item.status]}
        </Badge>
        {item.paidAt ? (
          <span className="text-xs text-muted-foreground">{formatMoment(item.paidAt)}</span>
        ) : null}
      </div>
      {item.statusNote ? <p className="text-xs text-muted-foreground">{item.statusNote}</p> : null}
    </li>
  );
}

/** Everything we owe the player: prizes, jackpot and refunds, with where each payment is. */
export function ObligationsCard() {
  const query = useQuery(api.payouts.myObligations.queryOptions());

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <Kicker>winnings</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">
          my prizes &amp; refunds
        </h2>
      </div>
      {query.data ? (
        query.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Prizes and refunds show up here, with where each payment is.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {query.data.items.map((item) => (
              <ObligationRow key={item.id} item={item} />
            ))}
          </ul>
        )
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton className="h-24" />
      )}
    </Card>
  );
}
