'use client';

import { product } from '@predict/brand';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, CalendarXIcon, CircleCheckIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { QueryError } from '@/components/query-error';
import { CopyButton } from '@/components/ui/copy-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker, PageHeader } from '@/components/ui/text';
import { api } from '@/lib/api';
import { clockOffset, useServerNow } from '@/lib/clock';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatDay, formatMoment, formatNaira, koboToNairaText } from '@/lib/format';
import type { CollectionAccountData, EntryData, MyDayData } from '@/lib/types';
import { FAIRNESS_NOTE } from './banners';
import { ClaimForm } from './claim-form';
import { PaymentTimeline } from './payment-timeline';

function AmountAndReference({ entry }: { entry: EntryData }) {
  return (
    <section
      aria-label="Amount and reference"
      className="flex flex-col gap-6 rounded-2xl bg-sg-night p-6 text-sg-chalk"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[2px] text-sg-chalk/60 uppercase">
            send exactly
          </p>
          <p className="font-mono text-4xl leading-none font-bold">{formatNaira(entry.feeKobo)}</p>
        </div>
        <CopyButton value={koboToNairaText(entry.feeKobo)} label="amount" variant="secondary" />
      </div>
      <div className="flex flex-col gap-2 border-t border-sg-chalk/10 pt-5">
        <p className="font-mono text-[10px] tracking-[2px] text-sg-chalk/60 uppercase">
          your payment reference
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-4xl leading-none font-bold tracking-[4px] text-sg-flash sm:text-5xl">
            {entry.paymentReference}
          </p>
          <CopyButton value={entry.paymentReference} label="reference" variant="secondary" />
        </div>
        <p className="text-sm text-sg-chalk/75">
          Put this in the transfer description (narration) so we can find your payment.
        </p>
      </div>
    </section>
  );
}

function AccountDetails({ account }: { account: CollectionAccountData }) {
  const rows = [
    { label: 'Bank', value: account.bankName, copy: false },
    { label: 'Account number', value: account.accountNumber, copy: true, mono: true },
    { label: 'Account name', value: account.accountName, copy: true },
  ];
  return (
    <Card>
      <CardHeader>
        <Kicker>to this account</Kicker>
        <CardTitle>Bank transfer details</CardTitle>
      </CardHeader>
      <dl className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className={row.mono ? 'font-mono text-lg font-bold tracking-[1px]' : 'font-bold'}>
                {row.value}
              </dd>
            </div>
            {row.copy ? <CopyButton value={row.value} label={row.label.toLowerCase()} /> : null}
          </div>
        ))}
      </dl>
    </Card>
  );
}

function HowToPay({ entry }: { entry: EntryData }) {
  const fee = formatNaira(entry.feeKobo);
  const steps = [
    `Open your bank app and send exactly ${fee} to the account above.`,
    `Type your reference ${entry.paymentReference} in the description (narration).`,
    'Tap "I\'ve sent it" below and tell us who sent it, so we find it faster.',
    'We confirm it once the money reaches our account, and your entry shows as confirmed.',
  ];
  return (
    <section aria-labelledby="how-to-pay" className="flex flex-col gap-3">
      <h2 id="how-to-pay" className="text-lg font-extrabold">
        how to pay
      </h2>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-3 text-sm">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold"
            >
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      <Alert>{FAIRNESS_NOTE}</Alert>
    </section>
  );
}

function ClaimSummary({ entry }: { entry: EntryData }) {
  const claim = entry.latestClaim;
  if (!claim) return null;
  const rows: [string, string][] = [
    ['Sent by', claim.senderName],
    ...(claim.senderBank ? ([['Bank', claim.senderBank]] as [string, string][]) : []),
    ['Amount', formatNaira(claim.amountKobo)],
    ['Paid', formatMoment(claim.paidAt)],
    ...(claim.transferReference
      ? ([['Transfer reference', claim.transferReference]] as [string, string][])
      : []),
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-semibold break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClaimSection({ entry, date, now }: { entry: EntryData; date: string; now: number }) {
  const pending = entry.status === 'payment_review' && entry.latestClaim?.status === 'pending';
  const [editing, setEditing] = useState(!pending);
  const [sent, setSent] = useState(false);

  return (
    <Card>
      <CardHeader>
        <Kicker>after you pay</Kicker>
        <CardTitle>{pending && !editing ? "We've got your details" : "I've sent it"}</CardTitle>
        <CardDescription>
          {pending && !editing
            ? "We're checking our account for your transfer."
            : 'Tell us about your transfer so we can match it to your entry quickly.'}
        </CardDescription>
      </CardHeader>
      {sent ? (
        <Alert variant="success">Thanks! We&apos;ll confirm your payment once we find it.</Alert>
      ) : null}
      {pending && !editing ? (
        <>
          <ClaimSummary entry={entry} />
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => {
              setSent(false);
              setEditing(true);
            }}
          >
            Update details
          </Button>
        </>
      ) : (
        <ClaimForm
          entry={entry}
          date={date}
          now={now}
          onDone={() => {
            setSent(true);
            setEditing(false);
          }}
        />
      )}
    </Card>
  );
}

function JoinPanel({ data }: { data: MyDayData }) {
  const queryClient = useQueryClient();
  const join = useMutation(
    api.entries.join.mutationOptions({
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: api.entries.key() }),
    }),
  );
  const { day } = data;

  if (day.status !== 'open') {
    return (
      <EmptyState
        title="This day isn't taking entries"
        description={
          day.status === 'published'
            ? 'Entries open when the day opens. Check back soon.'
            : 'Entries for this day have closed.'
        }
        action={
          <Button asChild variant="outline">
            <Link href="/">Back to today</Link>
          </Button>
        }
      />
    );
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <Kicker>{formatDay(day.date)}</Kicker>
        <CardTitle>Join for {formatNaira(day.settings.entryFeeKobo)}</CardTitle>
        <CardDescription>
          Joining gives you a payment reference. Then send the fee by bank transfer.
        </CardDescription>
      </CardHeader>
      {join.isError ? <Alert variant="destructive">{errorMessage(join.error)}</Alert> : null}
      <p className="text-sm text-muted-foreground">{FAIRNESS_NOTE}</p>
      <Button
        size="lg"
        disabled={join.isPending}
        onClick={() => join.mutate({ date: day.date })}
        className="self-start"
      >
        {join.isPending ? 'Joining…' : 'Join and get my reference'}
      </Button>
    </Card>
  );
}

function PayBoard({ data, date, offset }: { data: MyDayData; date: string; offset: number }) {
  // Only used for the claim form's default time, so a slow tick is enough.
  const now = useServerNow(offset, 30_000);
  const { day, entry, collectionAccount } = data;
  const back = (
    <Button asChild variant="outline" size="sm">
      <Link href={`/play/${date}`}>
        <ArrowLeftIcon aria-hidden />
        Your picks
      </Link>
    </Button>
  );

  const header = (
    <PageHeader kicker={`${formatDay(day.date)} · entry`} title="pay to enter" actions={back}>
      <p>
        Pay by bank transfer. We check every payment against our bank account, then your picks
        count.
      </p>
    </PageHeader>
  );

  if (!entry) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <JoinPanel data={data} />
      </div>
    );
  }

  if (entry.disqualified) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="destructive">
          This entry was disqualified, so there is nothing to pay. If you think this is a mistake,
          email {product.supportEmail}.
        </Alert>
      </div>
    );
  }

  if (entry.status === 'confirmed') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card className="max-w-lg">
          <div className="flex items-center gap-3">
            <CircleCheckIcon aria-hidden className="size-7 text-success" />
            <div>
              <p className="font-extrabold">You&apos;re in</p>
              <p className="text-sm text-muted-foreground">
                Payment confirmed
                {entry.confirmedAt ? ` ${formatMoment(entry.confirmedAt)}` : ''}.
              </p>
            </div>
          </div>
          <PaymentTimeline entry={entry} />
          <Button asChild className="self-start">
            <Link href={`/play/${date}`}>Back to your picks</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (entry.status === 'expired' || entry.status === 'refunded') {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert>
          {entry.status === 'refunded'
            ? 'Your entry fee was refunded. You can see refunds under Me.'
            : `We didn't confirm a payment for this entry in time. If you paid, email ${product.supportEmail} with your reference ${entry.paymentReference}.`}
        </Alert>
      </div>
    );
  }

  const canClaim = day.status === 'open' || day.status === 'closed';
  const rejected = entry.latestClaim?.status === 'rejected' ? entry.latestClaim : null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {rejected ? (
        <Alert variant="destructive">
          We couldn&apos;t match the payment details you sent
          {rejected.reviewNote ? `: ${rejected.reviewNote}` : '.'} Check them and send them again.
        </Alert>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <AmountAndReference entry={entry} />
          {collectionAccount ? (
            <AccountDetails account={collectionAccount} />
          ) : (
            <Alert>
              Our bank details aren&apos;t ready yet. Check back shortly, or email{' '}
              {product.supportEmail}.
            </Alert>
          )}
          <HowToPay entry={entry} />
        </div>
        <div className="flex flex-col gap-6">
          {canClaim ? (
            <ClaimSection entry={entry} date={date} now={now} />
          ) : (
            <Alert>Entries for this day have closed.</Alert>
          )}
          <Card>
            <CardHeader>
              <Kicker>status</Kicker>
              <CardTitle>Your entry</CardTitle>
            </CardHeader>
            <PaymentTimeline entry={entry} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/** How to pay for a day: amount, our account, the reference, and "I've sent it". */
export function PayScreen({ date }: { date: string }) {
  const query = useQuery(
    api.entries.myDay.queryOptions({
      input: { date },
      // Pick up the confirmation while the player waits on this page.
      refetchInterval: (current) => {
        const status = current.state.data?.entry?.status;
        return status === 'awaiting_payment' || status === 'payment_review' ? 20_000 : false;
      },
    }),
  );

  if (!query.data) {
    if (query.isError) {
      if (errorCode(query.error) === 'NOT_FOUND') {
        return (
          <EmptyState
            icon={<CalendarXIcon aria-hidden className="size-8" />}
            title="No match day on this date"
            description="There's no contest to pay for on this date."
            action={
              <Button asChild>
                <Link href="/">Back to today</Link>
              </Button>
            }
          />
        );
      }
      return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
    }
    return (
      <div role="status" aria-label="Loading payment details" className="flex flex-col gap-6">
        <Skeleton className="h-20 w-2/3" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <PayBoard
      data={query.data}
      date={date}
      offset={clockOffset(query.data.serverNow, query.dataUpdatedAt)}
    />
  );
}
