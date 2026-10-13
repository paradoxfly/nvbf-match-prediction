'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Ban, History, RotateCcw, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { DayStatusBadge, EntryStatusBadge } from '@/components/status-badges';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Kicker } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { errorCode } from '@/lib/errors';
import {
  formatDateTime,
  formatDay,
  formatNaira,
  formatWat,
  koboToInput,
  toWatInputs,
} from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { invalidate } from '@/lib/invalidate';
import type { PaymentItem } from '@/lib/types';
import {
  emptyTransfer,
  parseTransfer,
  TransferFields,
  type TransferDraft,
} from './transfer-fields';

const LIVE_DAY = ['open', 'closed'];
const DONE_DAY = ['finalized', 'completed', 'cancelled'];

/** Drawer with one entry's payment details and every action on it. */
export function EntrySheet({
  item,
  onChange,
  onClose,
}: {
  item: PaymentItem | null;
  onChange: (item: PaymentItem) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        {item ? <EntryDetails key={item.entryId} item={item} onChange={onChange} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return () =>
    invalidate(
      queryClient,
      api.admin.payments.key(),
      api.admin.days.key(),
      api.admin.results.key(),
    );
}

function EntryDetails({
  item,
  onChange,
}: {
  item: PaymentItem;
  onChange: (item: PaymentItem) => void;
}) {
  const admin = useAdmin();
  const toast = useToast();
  const refresh = useInvalidatePayments();
  const [warnings, setWarnings] = useState<string[]>([]);
  const isSuper = can(admin);
  const dayLive = LIVE_DAY.includes(item.day.status);
  const dayDone = DONE_DAY.includes(item.day.status);
  const claim = item.latestClaim;
  const awaiting = item.status === 'awaiting_payment' || item.status === 'payment_review';

  const reject = useMutation(
    api.admin.payments.rejectClaim.mutationOptions({
      onSuccess: (data) => {
        onChange(data);
        void refresh();
        toast({ title: 'Claim rejected', description: 'The player can send a new claim.' });
      },
    }),
  );
  const revoke = useMutation(
    api.admin.payments.revoke.mutationOptions({
      onSuccess: (data) => {
        onChange(data);
        void refresh();
        toast({
          title: 'Confirmation revoked',
          description: 'The pool was topped up to stay the same.',
        });
      },
    }),
  );
  const disqualify = useMutation(
    api.admin.payments.disqualify.mutationOptions({
      onSuccess: (data) => {
        onChange(data);
        void refresh();
        toast({ title: data.disqualified ? 'Entry disqualified' : 'Entry reinstated' });
      },
    }),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 pr-8">
        <Kicker>Entry payment</Kicker>
        <SheetTitle className="font-mono text-2xl font-bold tracking-[2px]">
          {item.paymentReference}
        </SheetTitle>
        <SheetDescription>
          {item.user.displayName} · {formatDay(item.day.date)}
        </SheetDescription>
        <div className="flex flex-wrap gap-1.5">
          <EntryStatusBadge status={item.status} />
          {item.disqualified ? <Badge variant="destructive">Disqualified</Badge> : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <Callout variant="warning" title="Check this isn't a duplicate" items={warnings} />
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Detail label="Player">
          <Link
            href={`/players/${item.user.id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {item.user.displayName}
          </Link>
          <span className="block text-xs break-all text-muted-foreground">{item.user.email}</span>
          <span className="block font-mono text-xs text-muted-foreground">{item.user.phone}</span>
        </Detail>
        <Detail label="Match-day">
          <Link
            href={`/days/${item.day.id}`}
            className="font-semibold underline-offset-4 hover:underline"
          >
            {formatDay(item.day.date)}
          </Link>
          <span className="mt-1 block">
            <DayStatusBadge status={item.day.status} />
          </span>
        </Detail>
        <Detail label="Entry fee">
          <span className="font-mono font-bold">{formatNaira(item.feeKobo)}</span>
        </Detail>
        <Detail label="Joined">{formatDateTime(item.createdAt)}</Detail>
        {item.confirmedAt ? (
          <Detail label="Confirmed">{formatDateTime(item.confirmedAt)}</Detail>
        ) : null}
      </dl>

      <section className="flex flex-col gap-2 rounded-sm bg-muted p-4">
        <Kicker>Player&apos;s claim</Kicker>
        {claim ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Detail label="Sender">{claim.senderName}</Detail>
            <Detail label="Bank">{claim.senderBank ?? '—'}</Detail>
            <Detail label="Amount">
              <span
                className={
                  claim.amountKobo !== item.feeKobo
                    ? 'font-mono font-bold text-destructive'
                    : 'font-mono'
                }
              >
                {formatNaira(claim.amountKobo)}
              </span>
            </Detail>
            <Detail label="Sent at">{formatWat(claim.paidAt)}</Detail>
            <Detail label="Their reference">
              <span className="font-mono break-all">{claim.transferReference ?? '—'}</span>
            </Detail>
            <Detail label="Claim">
              {claim.status === 'pending'
                ? 'Waiting for us'
                : claim.status === 'accepted'
                  ? 'Accepted'
                  : 'Rejected'}
            </Detail>
            {claim.reviewNote ? <Detail label="Our note">{claim.reviewNote}</Detail> : null}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            No claim yet: the player hasn&apos;t said they paid. You can still confirm a transfer
            you found on the statement.
          </p>
        )}
      </section>

      {awaiting && dayLive ? (
        <ConfirmPaymentForm
          item={item}
          onConfirmed={(entry, newWarnings) => {
            onChange(entry);
            setWarnings(newWarnings);
          }}
        />
      ) : awaiting && !dayLive ? (
        <Callout variant="info">
          This day is not open or closed, so payments for it can&apos;t be confirmed.
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {item.status === 'payment_review' ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <Ban aria-hidden />
                Reject claim
              </Button>
            }
            title="Reject this claim?"
            description="Use this when the transfer isn't on the statement. The entry goes back to waiting for payment and the player can send a new claim."
            confirmLabel="Reject claim"
            pendingLabel="Rejecting…"
            destructive
            reason={{
              label: 'What to tell the player',
              placeholder: 'e.g. No transfer of ₦500 from this name reached our account.',
            }}
            onConfirm={(reason) => reject.mutateAsync({ id: item.entryId, reason })}
          />
        ) : null}
        {isSuper && item.status === 'confirmed' && dayLive ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <RotateCcw aria-hidden />
                Revoke confirmation
              </Button>
            }
            title="Revoke this confirmation?"
            description="For a confirmation made by mistake. The entry goes back to waiting for payment and its money becomes unused on the transfer. The operator tops the pool up by the same amount, so the prize pool never shrinks."
            confirmLabel="Revoke confirmation"
            pendingLabel="Revoking…"
            destructive
            reason
            onConfirm={(reason) => revoke.mutateAsync({ id: item.entryId, reason })}
          />
        ) : null}
        {isSuper && !dayDone ? (
          item.disqualified ? (
            <ConfirmAction
              trigger={
                <Button variant="outline">
                  <UserCheck aria-hidden />
                  Reinstate
                </Button>
              }
              title="Reinstate this entry?"
              description="It is ranked again on the leaderboard."
              confirmLabel="Reinstate entry"
              pendingLabel="Saving…"
              reason
              onConfirm={(reason) =>
                disqualify.mutateAsync({ id: item.entryId, reason, undo: true })
              }
            />
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="destructive">
                  <UserX aria-hidden />
                  Disqualify
                </Button>
              }
              title="Disqualify this entry?"
              description="For duplicate accounts and rule breaks. The entry is removed from the ranking and can't win. Its fee stays in the pool."
              confirmLabel="Disqualify entry"
              pendingLabel="Saving…"
              destructive
              reason
              onConfirm={(reason) =>
                disqualify.mutateAsync({ id: item.entryId, reason, undo: false })
              }
            />
          )
        ) : null}
        {isSuper ? (
          <Button asChild variant="ghost">
            <Link href={`/audit?targetType=entry&targetId=${item.entryId}`}>
              <History aria-hidden />
              History
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt>
        <Kicker>{label}</Kicker>
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ConfirmPaymentForm({
  item,
  onConfirmed,
}: {
  item: PaymentItem;
  onConfirmed: (entry: PaymentItem, warnings: string[]) => void;
}) {
  const toast = useToast();
  const refresh = useInvalidatePayments();
  const claim = item.latestClaim;
  const [draft, setDraft] = useState<TransferDraft>(() =>
    emptyTransfer({
      bankReference: claim?.transferReference ?? '',
      amount: koboToInput(item.feeKobo),
      ...toWatInputs(claim?.paidAt),
      senderName: claim?.senderName ?? '',
    }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const now = useNow(30_000);
  const parsed = parseTransfer(draft, now);
  const confirm = useMutation(
    api.admin.payments.confirm.mutationOptions({
      onSuccess: (result) => {
        onConfirmed(result.entry, result.warnings);
        void refresh();
        toast({
          title: 'Payment confirmed',
          description:
            result.warnings.length > 0
              ? 'Check the warning in the drawer.'
              : `${item.user.displayName}'s picks now count.`,
        });
      },
    }),
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-extrabold">Confirm payment</h3>
        <p className="text-sm text-muted-foreground">
          Enter the transfer exactly as it appears on the bank statement. The claim fills in what
          the player told us; check every field against the statement.
        </p>
      </div>
      <TransferFields
        draft={draft}
        onChange={setDraft}
        showErrors={showErrors}
        expectedKobo={item.feeKobo}
      />
      <Button
        className="w-fit"
        onClick={() => {
          setShowErrors(true);
          if (parsed.input) setConfirming(true);
        }}
      >
        <BadgeCheck aria-hidden />
        Confirm payment
      </Button>
      {errorCode(confirm.error) === 'LATE_PAYMENT' ? (
        <Callout variant="warning" title="This money arrived after entries closed">
          <span>
            It can&apos;t confirm the entry. Record it in{' '}
            <Link href="/payments/transfers" className="font-semibold underline">
              Bank transfers
            </Link>{' '}
            and refund it from there.
          </span>
        </Callout>
      ) : null}
      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Confirm this payment?"
        description={
          parsed.input
            ? `${formatNaira(parsed.input.amountKobo)} from ${parsed.input.senderName ?? 'an unnamed sender'}, credited ${formatWat(parsed.input.creditedAt)}${parsed.input.bankReference ? `, reference ${parsed.input.bankReference}` : ' (no bank reference)'}. ${item.user.displayName}'s entry for ${formatDay(item.day.date)} will count.`
            : undefined
        }
        confirmLabel="Confirm payment"
        pendingLabel="Confirming…"
        onConfirm={() =>
          parsed.input
            ? confirm.mutateAsync({ id: item.entryId, transfer: parsed.input })
            : Promise.reject(new Error('Check the transfer details.'))
        }
      />
    </section>
  );
}
