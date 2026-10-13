'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { NIGERIAN_BANKS } from '@predict/contracts';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Kicker } from '@/components/ui/text';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { formatMoment } from '@/lib/format';
import type { PayoutAccountData } from '@/lib/types';

const AccountForm = z.object({
  bankCode: z.string().refine((code) => NIGERIAN_BANKS.some((bank) => bank.code === code), {
    error: 'Choose your bank from the list.',
  }),
  accountNumber: z.string().regex(/^\d{10}$/, { error: 'Enter your 10-digit account number.' }),
  accountName: z
    .string()
    .trim()
    .min(3, { error: 'Enter the name on the account.' })
    .max(120, { error: 'Use at most 120 characters.' }),
});
type AccountValues = z.infer<typeof AccountForm>;

type Account = NonNullable<PayoutAccountData['current']>;

function AccountSummary({ account }: { account: Account }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Bank</dt>
      <dd className="font-semibold">{account.bankName}</dd>
      <dt className="text-muted-foreground">Account</dt>
      <dd className="font-mono font-semibold">****{account.last4}</dd>
      <dt className="text-muted-foreground">Name</dt>
      <dd className="font-semibold break-words">{account.accountName}</dd>
    </dl>
  );
}

function AccountFormView({
  onSaved,
  onCancel,
}: {
  onSaved: (data: PayoutAccountData) => void;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<AccountValues>({
    resolver: zodResolver(AccountForm),
    defaultValues: { bankCode: '', accountNumber: '', accountName: '' },
  });
  const save = useMutation(
    api.payouts.saveAccount.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(api.payouts.myAccount.queryKey(), data);
        void queryClient.invalidateQueries({ queryKey: api.payouts.key() });
        onSaved(data);
      },
    }),
  );
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      {save.isError ? <Alert variant="destructive">{errorMessage(save.error)}</Alert> : null}
      <Field label="Bank" error={errors.bankCode?.message}>
        <Select {...form.register('bankCode')}>
          <option value="">Choose your bank</option>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank.code} value={bank.code}>
              {bank.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Account number" hint="10 digits (NUBAN)." error={errors.accountNumber?.message}>
        <Input
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="font-mono tracking-[2px]"
          {...form.register('accountNumber', {
            onChange: (event: { target: { value: string } }) =>
              form.setValue('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 10)),
          })}
        />
      </Field>
      <Field
        label="Account name"
        hint="Exactly as your bank shows it. It should be your own name."
        error={errors.accountName?.message}
      >
        <Input autoComplete="name" {...form.register('accountName')} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save bank details'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Where we send winnings and refunds. Only the last 4 digits ever come back from the API. */
export function PayoutAccountCard() {
  const queryClient = useQueryClient();
  const query = useQuery(api.payouts.myAccount.queryOptions());
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useMutation(
    api.payouts.cancelPendingAccount.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(api.payouts.myAccount.queryKey(), data);
        setNotice('The change was cancelled. We keep paying your current account.');
      },
    }),
  );

  const data = query.data;
  return (
    <Card id="bank-details" className="scroll-mt-6">
      <div className="flex flex-col gap-1">
        <Kicker>getting paid</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">
          bank details for winnings
        </h2>
      </div>
      <p className="flex gap-2 text-sm text-muted-foreground">
        <ShieldCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          We only use these details to pay you, and only our finance team can see them. A change
          takes effect after 24 hours (straight away if we told you your details didn&apos;t work),
          and we email you about it.
        </span>
      </p>

      {notice ? <Alert variant="success">{notice}</Alert> : null}

      {!data ? (
        query.isError ? (
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton className="h-28" />
        )
      ) : (
        <>
          {data.current ? (
            <div className="flex flex-col gap-2 rounded-sm bg-muted p-3">
              <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
                current account
              </span>
              <AccountSummary account={data.current} />
            </div>
          ) : null}

          {data.pending ? (
            <div className="flex flex-col gap-2 rounded-sm border border-border p-3">
              <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
                changing to, from {formatMoment(data.pending.activeFrom)}
              </span>
              <AccountSummary account={data.pending} />
              <p className="text-xs text-muted-foreground">
                Didn&apos;t make this change? Cancel it now and tell us.
              </p>
              {cancel.isError ? (
                <Alert variant="destructive">{errorMessage(cancel.error)}</Alert>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(undefined)}
              >
                {cancel.isPending ? 'Cancelling…' : 'Cancel this change'}
              </Button>
            </div>
          ) : null}

          {!data.current || editing ? (
            <AccountFormView
              onCancel={data.current ? () => setEditing(false) : undefined}
              onSaved={(saved) => {
                setEditing(false);
                setNotice(
                  saved.pending
                    ? "Saved. The new account is used after 24 hours, and we've sent you a text."
                    : "Saved. We'll pay your winnings into this account.",
                );
              }}
            />
          ) : (
            <Button
              variant="outline"
              className="self-start"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
            >
              Change bank details
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
