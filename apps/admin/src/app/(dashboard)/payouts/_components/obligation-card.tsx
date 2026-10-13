'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { cn } from '@predict/ui/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  BadgeCheck,
  CirclePause,
  CirclePlay,
  Eye,
  Hand,
  Send,
  TriangleAlert,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { NairaInput } from '@/components/inputs';
import { ObligationKindBadge, ObligationStatusBadge } from '@/components/status-badges';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { CopyButton } from '@/components/ui/copy-button';
import { DialogForm } from '@/components/ui/dialog-form';
import { Kicker } from '@/components/ui/stat';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import {
  formatDateTime,
  formatNaira,
  formatWat,
  koboToInput,
  ordinal,
  parseNaira,
} from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { invalidate } from '@/lib/invalidate';
import type { Obligation, PayoutAttempt } from '@/lib/types';

const REVEAL_MS = 60_000;

function useRefreshPayouts() {
  const queryClient = useQueryClient();
  return () => invalidate(queryClient, api.admin.payouts.key(), api.admin.days.key());
}

export function ObligationCard({ obligation }: { obligation: Obligation }) {
  const admin = useAdmin();
  const toast = useToast();
  const refresh = useRefreshPayouts();
  const now = useNow(60_000);
  const isSuper = can(admin);
  const { account, user, status } = obligation;
  const pendingChange = account ? new Date(account.activeFrom).getTime() > now : false;

  const markFailed = useMutation(
    api.admin.payouts.markFailed.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Marked as failed', description: 'It is back in Ready to try again.' });
      },
    }),
  );
  const invalidDetails = useMutation(
    api.admin.payouts.invalidDetails.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Player asked for new bank details' });
      },
    }),
  );
  const hold = useMutation(
    api.admin.payouts.hold.mutationOptions({
      onSuccess: (data) => {
        void refresh();
        toast({ title: data.status === 'on_hold' ? 'Payout on hold' : 'Payout released' });
      },
    }),
  );

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <ObligationKindBadge kind={obligation.kind} />
            <ObligationStatusBadge status={status} />
            {obligation.rank !== null ? (
              <Badge variant="muted">{ordinal(obligation.rank)} place</Badge>
            ) : null}
          </div>
          <p className="font-bold">{obligation.label}</p>
          {obligation.reason ? (
            <p className="text-xs text-muted-foreground">Reason: {obligation.reason}</p>
          ) : null}
          {obligation.statusNote ? (
            <p className="text-xs text-muted-foreground">Note: {obligation.statusNote}</p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="font-mono text-2xl leading-none font-bold">
            {formatNaira(obligation.amountKobo)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            owed since {formatDateTime(obligation.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Kicker>Player</Kicker>
          {user ? (
            <>
              <Link
                href={`/players/${user.id}`}
                className="font-semibold underline-offset-4 hover:underline"
              >
                {user.displayName}
              </Link>
              <a
                href={`mailto:${user.email}`}
                className="text-xs break-all text-muted-foreground hover:underline"
              >
                {user.email}
              </a>
              <a
                href={`tel:${user.phone}`}
                className="font-mono text-xs text-muted-foreground hover:underline"
              >
                {user.phone}
              </a>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No player linked: pay it back to the sender by hand.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Kicker>Pay to</Kicker>
          {account ? (
            <>
              <p className="text-sm">
                <span className="font-semibold">{account.accountName}</span>
                <span className="text-muted-foreground"> · {account.bankName} · </span>
                <span className="font-mono">••••{account.last4}</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pendingChange ? <Badge variant="accent">Changed recently</Badge> : null}
                {obligation.sharedAccountUsers > 1 ? (
                  <Badge variant="destructive">
                    <TriangleAlert aria-hidden />
                    Account used by {obligation.sharedAccountUsers} players
                  </Badge>
                ) : null}
              </div>
              {pendingChange ? (
                <p className="text-xs text-muted-foreground">
                  The player changed their account. The new one is used from{' '}
                  {formatWat(account.activeFrom)} (24-hour safety delay).
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No bank details yet.</p>
          )}
        </div>
      </div>

      {obligation.sharedAccountUsers > 1 ? (
        <Callout variant="warning">
          Several players use this bank account: a sign of duplicate accounts. Check before paying.
        </Callout>
      ) : null}

      {account && status !== 'paid' ? <RevealAccount obligation={obligation} /> : null}

      {obligation.attempts.length > 0 ? <Attempts attempts={obligation.attempts} /> : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {status === 'ready' ? <StartPayoutDialog obligation={obligation} /> : null}
        {status === 'processing' ? <MarkPaidDialog obligation={obligation} /> : null}
        {status === 'processing' ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <Ban aria-hidden />
                Transfer failed
              </Button>
            }
            title="Did the transfer fail?"
            description="The payout goes back to Ready so you can try again."
            confirmLabel="Mark as failed"
            pendingLabel="Saving…"
            destructive
            reason={{ placeholder: 'e.g. Reversed by the receiving bank.' }}
            onConfirm={(reason) => markFailed.mutateAsync({ id: obligation.id, reason })}
          />
        ) : null}
        {status === 'ready' || status === 'processing' ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <UserX aria-hidden />
                Invalid details
              </Button>
            }
            title="Bank details don't check out?"
            description="Use this when the account number or name is wrong. We ask the player for new details; the payout waits until they fix them."
            confirmLabel="Ask for new details"
            pendingLabel="Saving…"
            destructive
            reason={{
              label: 'What was wrong',
              placeholder: 'e.g. Name enquiry shows a different person.',
            }}
            onConfirm={(reason) => invalidDetails.mutateAsync({ id: obligation.id, reason })}
          />
        ) : null}
        {isSuper && status === 'on_hold' ? (
          <ConfirmAction
            trigger={
              <Button variant="outline">
                <CirclePlay aria-hidden />
                Release hold
              </Button>
            }
            title="Release this payout?"
            description="It goes back to the queue and can be paid."
            confirmLabel="Release"
            pendingLabel="Saving…"
            reason
            onConfirm={(reason) => hold.mutateAsync({ id: obligation.id, reason, hold: false })}
          />
        ) : null}
        {isSuper && status !== 'on_hold' && status !== 'paid' && status !== 'processing' ? (
          <ConfirmAction
            trigger={
              <Button variant="ghost">
                <CirclePause aria-hidden />
                Hold
              </Button>
            }
            title="Put this payout on hold?"
            description="Nobody can pay it until a super admin releases it, e.g. while checking for duplicate accounts."
            confirmLabel="Hold payout"
            pendingLabel="Saving…"
            destructive
            reason
            onConfirm={(reason) => hold.mutateAsync({ id: obligation.id, reason, hold: true })}
          />
        ) : null}
      </div>
    </Card>
  );
}

function RevealAccount({ obligation }: { obligation: Obligation }) {
  const [shown, setShown] = useState<{
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null>(null);
  const reveal = useMutation(
    api.admin.payouts.revealAccount.mutationOptions({ onSuccess: setShown }),
  );

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (shown) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm bg-sg-night px-4 py-3 text-white">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] tracking-[2px] text-white/60 uppercase">
            {shown.bankName} · hides in a minute
          </span>
          <span className="font-mono text-xl font-bold tracking-[3px]">{shown.accountNumber}</span>
          <span className="text-sm text-white/80">{shown.accountName}</span>
        </div>
        <div className="flex gap-2">
          <CopyButton value={shown.accountNumber} label="Copy number" />
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={() => setShown(null)}
          >
            Hide
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ConfirmAction
      trigger={
        <Button variant="outline" size="sm" className="w-fit">
          <Eye aria-hidden />
          Reveal account number
        </Button>
      }
      title="Show the full account number?"
      description="This is logged in the audit trail with your name. The number hides again after a minute."
      confirmLabel="Show number"
      pendingLabel="Loading…"
      onConfirm={() => reveal.mutateAsync({ id: obligation.id })}
    />
  );
}

function Attempts({ attempts }: { attempts: PayoutAttempt[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground select-none hover:text-foreground">
        Transfer attempts ({attempts.length})
      </summary>
      <ol className="mt-2 flex flex-col divide-y divide-border">
        {attempts.map((attempt) => (
          <li key={attempt.id} className="flex flex-col gap-1 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  attempt.status === 'paid'
                    ? 'success'
                    : attempt.status === 'failed'
                      ? 'destructive'
                      : 'default'
                }
              >
                {attempt.status === 'pending'
                  ? 'In progress'
                  : attempt.status === 'paid'
                    ? 'Paid'
                    : 'Failed'}
              </Badge>
              <span className="font-mono font-bold">{formatNaira(attempt.amountKobo)}</span>
              {attempt.bankName ? (
                <span className="text-muted-foreground">
                  {attempt.bankName} ••••{attempt.last4} · {attempt.accountName}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground">
              Started {formatDateTime(attempt.startedAt)}
              {attempt.completedAt ? ` · finished ${formatDateTime(attempt.completedAt)}` : ''}
              {attempt.nameEnquiryName ? ` · bank showed “${attempt.nameEnquiryName}”` : ''}
            </p>
            {attempt.transferReference ? (
              <p>
                Reference <span className="font-mono">{attempt.transferReference}</span>
              </p>
            ) : null}
            {attempt.failureReason ? (
              <p className="text-destructive">Failed: {attempt.failureReason}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

function StartPayoutDialog({ obligation }: { obligation: Obligation }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send aria-hidden />
          Start payout
        </Button>
      </DialogTrigger>
      <DialogContent>
        <StartPayoutForm obligation={obligation} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function StartPayoutForm({ obligation, onDone }: { obligation: Obligation; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefreshPayouts();
  const [name, setName] = useState('');
  const start = useMutation(
    api.admin.payouts.start.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({
          title: 'Payout started',
          description: 'Mark it paid once the transfer goes through.',
        });
        onDone();
      },
    }),
  );
  const expected = obligation.account?.accountName ?? null;
  const mismatch = expected !== null && name.trim().length >= 2 && !sameName(name, expected);

  return (
    <DialogForm
      title={`Pay ${formatNaira(obligation.amountKobo)}`}
      description="Start the transfer in your bank app. Before sending, type the account name your bank's name enquiry shows."
      submitLabel="I'm sending it"
      pendingLabel="Saving…"
      pending={start.isPending}
      canSubmit={name.trim().length >= 2}
      error={start.error}
      onSubmit={() => start.mutate({ id: obligation.id, nameEnquiryName: name.trim() })}
    >
      {obligation.account ? (
        <div className="rounded-sm bg-muted px-3 py-2 text-sm">
          <p>
            <span className="font-semibold">{obligation.account.accountName}</span> ·{' '}
            {obligation.account.bankName} ·{' '}
            <span className="font-mono">••••{obligation.account.last4}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            The name the player gave. Reveal the full number on the card.
          </p>
        </div>
      ) : null}
      <Field label="Name your bank shows" hint="Exactly as the name enquiry returns it.">
        <Input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </Field>
      {mismatch ? (
        <Callout variant="warning">
          That isn&apos;t the name the player gave. If it&apos;s clearly a different person, cancel
          and use Invalid details instead.
        </Callout>
      ) : null}
    </DialogForm>
  );
}

function MarkPaidDialog({ obligation }: { obligation: Obligation }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <BadgeCheck aria-hidden />
          Mark paid
        </Button>
      </DialogTrigger>
      <DialogContent>
        <MarkPaidForm obligation={obligation} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function MarkPaidForm({ obligation, onDone }: { obligation: Obligation; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefreshPayouts();
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(koboToInput(obligation.amountKobo));
  const markPaid = useMutation(
    api.admin.payouts.markPaid.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Marked as paid' });
        onDone();
      },
    }),
  );
  const parsed = parseNaira(amount, { min: 1 });
  const wrongAmount = parsed.kobo !== null && parsed.kobo !== obligation.amountKobo;

  return (
    <DialogForm
      title="Mark as paid"
      description="Only once the money has left our account. Use the reference your bank gave the transfer."
      submitLabel="Mark paid"
      pendingLabel="Saving…"
      pending={markPaid.isPending}
      canSubmit={reference.trim().length >= 3 && parsed.kobo === obligation.amountKobo}
      error={markPaid.error}
      onSubmit={() =>
        markPaid.mutate({
          id: obligation.id,
          transferReference: reference.trim(),
          amountKobo: obligation.amountKobo,
        })
      }
    >
      <Field label="Transfer reference">
        <Input
          value={reference}
          maxLength={80}
          className="font-mono"
          autoComplete="off"
          onChange={(event) => setReference(event.target.value)}
        />
      </Field>
      <Field
        label="Amount sent"
        hint={`Must be exactly ${formatNaira(obligation.amountKobo, { kobo: obligation.amountKobo % 100 !== 0 })}, what we owe.`}
        error={
          parsed.error ??
          (wrongAmount ? `This must equal ${formatNaira(obligation.amountKobo)}.` : undefined)
        }
      >
        <NairaInput value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      <p className={cn('text-xs', 'text-muted-foreground')}>
        <Hand className="mr-1 inline size-3.5" aria-hidden />
        Sent a different amount by mistake? Don&apos;t mark it paid: talk to a super admin.
      </p>
    </DialogForm>
  );
}
