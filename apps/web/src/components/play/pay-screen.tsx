'use client';

import { product } from '@predict/brand';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarXIcon,
  CircleCheckIcon,
  HourglassIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
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

type PayStep = 'account' | 'send' | 'claim';
type PayView = PayStep | 'review';

const PAY_STEPS: { key: PayStep; label: string }[] = [
  { key: 'account', label: 'Bank details' },
  { key: 'send', label: 'Send money' },
  { key: 'claim', label: 'Tell us' },
];

function StepProgress({ current }: { current: PayStep }) {
  const index = PAY_STEPS.findIndex((step) => step.key === current);
  return (
    <ol aria-label="Payment steps" className="grid grid-cols-3 gap-2">
      {PAY_STEPS.map((step, position) => (
        <li
          key={step.key}
          aria-current={position === index ? 'step' : undefined}
          className="flex flex-col gap-1.5"
        >
          <span
            aria-hidden
            className={cn(
              'h-1.5 rounded-full',
              position <= index ? 'bg-sg-night' : 'bg-sg-night/15',
            )}
          />
          <span className={cn('text-xs font-bold', position > index && 'text-muted-foreground')}>
            {position + 1}. {step.label}
            {position < index ? <span className="sr-only"> (done)</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One payment step: where the player is, what to do, and the way on (or back). */
function StepFrame({
  step,
  title,
  headingRef,
  onBack,
  children,
  next,
}: {
  step: PayStep;
  title: string;
  headingRef: Ref<HTMLHeadingElement>;
  onBack?: () => void;
  children: ReactNode;
  next?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex max-w-xl flex-col gap-4">
      <StepProgress current={step} />
      <div className="flex items-center justify-between gap-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-xl leading-tight font-extrabold tracking-[-0.5px] outline-none"
        >
          {title}
        </h2>
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeftIcon aria-hidden />
            Back
          </Button>
        ) : null}
      </div>
      {children}
      {next}
    </section>
  );
}

function CheckingPayment({
  entry,
  onUpdate,
  onShowDetails,
}: {
  entry: EntryData;
  onUpdate: () => void;
  onShowDetails: () => void;
}) {
  return (
    <Card className="max-w-xl">
      <div className="flex items-start gap-3">
        <HourglassIcon aria-hidden className="mt-0.5 size-6 shrink-0" />
        <div>
          <h2 className="font-extrabold">We&apos;re checking your payment</h2>
          <p className="text-sm text-muted-foreground">
            We confirm it as soon as we find the money in our account. This page updates by itself.
          </p>
        </div>
      </div>
      <ClaimSummary entry={entry} />
      <PaymentTimeline entry={entry} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onUpdate}>
          Update details
        </Button>
        <Button type="button" variant="ghost" onClick={onShowDetails}>
          See bank details
        </Button>
      </div>
    </Card>
  );
}

/** Paying, one screen at a time: our account, the amount and reference, then "I've sent it". */
function PayFlow({
  entry,
  account,
  date,
  now,
  canClaim,
}: {
  entry: EntryData;
  account: CollectionAccountData | null;
  date: string;
  now: number;
  canClaim: boolean;
}) {
  const pending = entry.status === 'payment_review' && entry.latestClaim?.status === 'pending';
  const rejected = entry.latestClaim?.status === 'rejected' ? entry.latestClaim : null;
  const [chosen, setChosen] = useState<PayView>(
    pending ? 'review' : rejected ? 'claim' : 'account',
  );
  // Details turned down while the player waited: back to the form to send them again.
  const view: PayView = chosen === 'review' && !pending ? 'claim' : chosen;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const fee = formatNaira(entry.feeKobo);

  // Each step starts at the top of the page, with focus on its heading.
  useEffect(() => {
    if (!moved.current) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  function go(next: PayView) {
    moved.current = true;
    setChosen(next);
  }

  if (view === 'review') {
    return (
      <CheckingPayment
        entry={entry}
        onUpdate={() => go('claim')}
        onShowDetails={() => go('account')}
      />
    );
  }

  if (view === 'account') {
    return (
      <StepFrame
        step="account"
        title="Send to this account"
        headingRef={headingRef}
        next={
          account ? (
            <Button size="lg" className="sm:self-start" onClick={() => go('send')}>
              Next: amount and reference
              <ArrowRightIcon aria-hidden />
            </Button>
          ) : null
        }
      >
        {account ? (
          <>
            <p className="text-sm text-muted-foreground">
              Open your bank app and start a transfer of{' '}
              <span className="font-bold text-foreground">{fee}</span> to this account.
            </p>
            <AccountDetails account={account} />
            <p className="text-xs text-muted-foreground">{FAIRNESS_NOTE}</p>
          </>
        ) : (
          <Alert>
            Our bank details aren&apos;t ready yet. Check back shortly, or email{' '}
            {product.supportEmail}.
          </Alert>
        )}
      </StepFrame>
    );
  }

  if (view === 'send') {
    return (
      <StepFrame
        step="send"
        title="Send the money"
        headingRef={headingRef}
        onBack={() => go('account')}
        next={
          <Button size="lg" className="sm:self-start" onClick={() => go('claim')}>
            I&apos;ve sent it
            <ArrowRightIcon aria-hidden />
          </Button>
        }
      >
        <AmountAndReference entry={entry} />
      </StepFrame>
    );
  }

  return (
    <StepFrame
      step="claim"
      title="Tell us you've sent it"
      headingRef={headingRef}
      onBack={() => go(pending ? 'review' : 'send')}
    >
      {rejected ? (
        <Alert variant="destructive">
          We couldn&apos;t match the payment details you sent
          {rejected.reviewNote ? `: ${rejected.reviewNote}` : '.'} Check them and send them again.
        </Alert>
      ) : null}
      {canClaim ? (
        <ClaimForm entry={entry} date={date} now={now} onDone={() => go('review')} />
      ) : (
        <Alert>Entries for this day have closed.</Alert>
      )}
    </StepFrame>
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
    <PageHeader kicker={`${formatDay(day.date)} · entry`} title="pay to enter" actions={back} />
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

  return (
    <div className="flex flex-col gap-6">
      {header}
      <PayFlow
        entry={entry}
        account={collectionAccount}
        date={date}
        now={now}
        canClaim={day.status === 'open' || day.status === 'closed'}
      />
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
