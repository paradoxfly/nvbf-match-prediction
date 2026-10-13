'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { Textarea } from '@predict/ui/textarea';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, HandCoins, Plus, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DialogForm } from '@/components/ui/dialog-form';
import { Pager } from '@/components/ui/pager';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatNaira, formatShortDay, formatWat } from '@/lib/format';
import { useDebounced, useNow } from '@/lib/hooks';
import { invalidate } from '@/lib/invalidate';
import type { BankPayment } from '@/lib/types';
import { PaymentsNav } from '../../_components/payments-nav';
import { emptyTransfer, parseTransfer, TransferFields } from '../../_components/transfer-fields';

const PAGE_SIZE = 25;

export function TransfersScreen() {
  const admin = useAdmin();
  if (!can(admin, 'finance')) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Money" title="bank transfers" />
        <NoAccess what="bank transfers" />
      </div>
    );
  }
  return <TransfersList />;
}

function TransfersList() {
  const params = useSearchParams();
  const [unusedOnly, setUnusedOnly] = useState(params.get('unused') === '1');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  const q = useDebounced(search.trim(), 350);
  const transfers = useQuery(
    api.admin.payments.transfers.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        // `false` would be sent as the string "false" and read as true: omit it instead.
        unappliedOnly: unusedOnly ? true : undefined,
        q: q || undefined,
      },
      placeholderData: keepPreviousData,
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Money"
        title="bank transfers"
        description="Every transfer recorded from the bank statement, and what it paid for. Unused money is refunded or applied to another entry."
        actions={<PaymentsNav />}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
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
                placeholder="Bank reference, sender or narration"
                className="pl-9"
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </Field>
          <SwitchField
            label="Unused money only"
            checked={unusedOnly}
            onCheckedChange={(checked) => {
              setUnusedOnly(checked);
              setPage(1);
            }}
            className="items-center pb-2"
          />
        </div>
        <RecordTransferDialog />
      </div>
      <QueryState query={transfers}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<HandCoins className="size-6" />}
              title={unusedOnly ? 'No unused money' : 'No transfers found'}
              description={
                unusedOnly
                  ? 'Every recorded transfer is fully applied or refunded.'
                  : 'Transfers appear here when payments are confirmed or recorded.'
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Card className={cn('p-0', transfers.isPlaceholderData && 'opacity-60')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Transfer</TableHead>
                      <TableHead>Sender</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Unused</TableHead>
                      <TableHead>Entries</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((transfer) => (
                      <TransferRow key={transfer.id} transfer={transfer} />
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

function useRefreshTransfers() {
  const queryClient = useQueryClient();
  return () => invalidate(queryClient, api.admin.payments.key(), api.admin.payouts.key());
}

function TransferRow({ transfer }: { transfer: BankPayment }) {
  const toast = useToast();
  const refresh = useRefreshTransfers();
  const voidTransfer = useMutation(
    api.admin.payments.voidTransfer.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Transfer voided' });
      },
    }),
  );
  const canVoid = !transfer.voided && transfer.appliedKobo === 0 && transfer.refundedKobo === 0;
  const canRefund = !transfer.voided && transfer.unappliedKobo > 0;

  return (
    <TableRow className={cn('align-top', transfer.voided && 'opacity-60')}>
      <TableCell className="max-w-56">
        {transfer.bankReference ? (
          <span className="block font-mono text-xs font-bold break-all">
            {transfer.bankReference}
          </span>
        ) : (
          <span className="block text-xs font-semibold">No bank reference</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {formatWat(transfer.creditedAt)}
        </span>
        {transfer.note ? (
          <span className="mt-1 block text-xs text-muted-foreground">{transfer.note}</span>
        ) : null}
        {transfer.voided ? (
          <Badge variant="destructive" className="mt-1">
            Voided
          </Badge>
        ) : null}
      </TableCell>
      <TableCell className="max-w-48 text-sm">
        {transfer.senderName ?? '—'}
        {transfer.narration ? (
          <span className="block text-xs break-words text-muted-foreground">
            {transfer.narration}
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <span className="block font-mono font-bold">{formatNaira(transfer.amountKobo)}</span>
        <span className="block text-xs text-muted-foreground">
          {formatNaira(transfer.appliedKobo)} applied
        </span>
        {transfer.refundedKobo > 0 ? (
          <span className="block text-xs text-muted-foreground">
            {formatNaira(transfer.refundedKobo)} refunded
          </span>
        ) : null}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono whitespace-nowrap',
          transfer.unappliedKobo > 0 && !transfer.voided && 'font-bold text-destructive',
        )}
      >
        {formatNaira(transfer.unappliedKobo)}
      </TableCell>
      <TableCell>
        {transfer.entries.length === 0 ? (
          <span className="text-xs text-muted-foreground">None</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {transfer.entries.map((entry) => (
              <li key={entry.id} className="text-xs whitespace-nowrap">
                <span className="font-mono font-bold">{entry.paymentReference}</span>{' '}
                <span className="text-muted-foreground">{formatShortDay(entry.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-end gap-1">
          {canRefund ? <RefundDialog transfer={transfer} /> : null}
          {canVoid ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm">
                  <Ban aria-hidden />
                  Void
                </Button>
              }
              title="Void this transfer record?"
              description="For a record typed by mistake (it never reached the account, or it's a duplicate). Only possible while none of its money is used."
              confirmLabel="Void record"
              pendingLabel="Voiding…"
              destructive
              reason
              onConfirm={(reason) => voidTransfer.mutateAsync({ id: transfer.id, reason })}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function RecordTransferDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Record transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <RecordTransferForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RecordTransferForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTransfers();
  const [draft, setDraft] = useState(() => emptyTransfer());
  const [showErrors, setShowErrors] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const now = useNow(30_000);
  const parsed = parseTransfer(draft, now);
  const record = useMutation(
    api.admin.payments.recordTransfer.mutationOptions({
      onSuccess: (result) => {
        void refresh();
        if (result.warnings.length > 0) {
          setWarnings(result.warnings);
          toast({ title: 'Transfer recorded', description: 'Check the warning before closing.' });
        } else {
          toast({
            title: 'Transfer recorded',
            description: 'It shows as unused money until applied or refunded.',
          });
          onDone();
        }
      },
    }),
  );

  if (warnings.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        <Callout variant="warning" title="Recorded, but check this" items={warnings} />
        <p className="text-sm text-muted-foreground">
          If it is the same transfer twice, void one of the records.
        </p>
        <Button className="w-fit" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <DialogForm
      title="Record a transfer"
      description="For money that arrived without confirming an entry: late, from an unknown sender, or more than the fee. It stays as unused money until you refund it."
      submitLabel="Record transfer"
      pendingLabel="Recording…"
      pending={record.isPending}
      error={record.error}
      onSubmit={() => {
        setShowErrors(true);
        if (parsed.input) record.mutate(parsed.input);
      }}
    >
      <TransferFields draft={draft} onChange={setDraft} showErrors={showErrors} />
    </DialogForm>
  );
}

function RefundDialog({ transfer }: { transfer: BankPayment }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <HandCoins aria-hidden />
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent>
        <RefundForm transfer={transfer} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RefundForm({ transfer, onDone }: { transfer: BankPayment; onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefreshTransfers();
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState(transfer.senderName ?? '');
  const [player, setPlayer] = useState<{ id: string; displayName: string; phone: string } | null>(
    null,
  );
  const q = useDebounced(search.trim(), 350);
  const players = useQuery(
    api.admin.players.list.queryOptions({
      input: { q, page: 1, pageSize: 6 },
      enabled: q.length >= 2 && player === null,
    }),
  );
  const refund = useMutation(
    api.admin.payouts.refundTransfer.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Refund created', description: 'Send it from Payouts & refunds.' });
        onDone();
      },
    }),
  );

  return (
    <DialogForm
      title={`Refund ${formatNaira(transfer.unappliedKobo)}`}
      description="Turns the unused money on this transfer into a refund to send from Payouts & refunds."
      submitLabel="Create refund"
      pendingLabel="Creating…"
      pending={refund.isPending}
      canSubmit={reason.trim().length >= 3}
      error={refund.error}
      onSubmit={() => refund.mutate({ id: transfer.id, reason: reason.trim(), userId: player?.id })}
    >
      <Field label="Reason" hint="At least 3 characters. Saved in the audit log.">
        <Textarea
          value={reason}
          maxLength={500}
          className="min-h-16"
          placeholder="e.g. Paid after entries closed."
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Player to refund (optional)</span>
        {player ? (
          <div className="flex items-center justify-between gap-2 rounded-sm bg-muted px-3 py-2 text-sm">
            <span>
              <span className="font-semibold">{player.displayName}</span>{' '}
              <span className="font-mono text-xs text-muted-foreground">{player.phone}</span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPlayer(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <Input
              type="search"
              value={search}
              placeholder="Search players by name, email or phone"
              onChange={(event) => setSearch(event.target.value)}
            />
            {q.length >= 2 ? (
              players.isPending ? (
                <p className="text-xs text-muted-foreground">Searching…</p>
              ) : players.data && players.data.items.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
                  {players.data.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() =>
                          setPlayer({
                            id: item.id,
                            displayName: item.displayName,
                            phone: item.phone,
                          })
                        }
                      >
                        <span className="font-semibold">{item.displayName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.phone}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No players match.</p>
              )
            ) : null}
            <p className="text-xs text-muted-foreground">
              With a player, the refund goes to the bank details they add. Without one, pay it back
              to the sender by hand and record it in Payouts.
            </p>
          </>
        )}
      </div>
    </DialogForm>
  );
}
