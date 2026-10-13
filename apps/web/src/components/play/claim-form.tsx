'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { NIGERIAN_BANKS } from '@predict/contracts';
import { nairaToKobo, watDate, watTime, watToUtc } from '@predict/domain';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { koboToNairaText } from '@/lib/format';
import type { EntryData } from '@/lib/types';

/** Ten minutes of grace for phones whose clock runs a little fast. */
const FUTURE_GRACE_MS = 10 * 60 * 1000;

function isNairaAmount(value: string): boolean {
  try {
    return nairaToKobo(value) >= 100;
  } catch {
    return false;
  }
}

const ClaimSchema = z.object({
  senderName: z
    .string()
    .trim()
    .min(2, { error: 'Enter the name on the account you sent from.' })
    .max(120, { error: 'Use at most 120 characters.' }),
  senderBank: z.string().max(80),
  amount: z
    .string()
    .trim()
    .min(1, { error: 'Enter the amount you sent.' })
    .refine(isNairaAmount, { error: 'Enter an amount like 500 or 500.50.' }),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Choose the day you paid.' }),
  paidTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Choose the time you paid.' }),
  transferReference: z.string().trim().max(80, { error: 'Use at most 80 characters.' }),
});
type ClaimValues = z.infer<typeof ClaimSchema>;

/** "I've sent it": details that help us find the transfer in our statement. */
export function ClaimForm({
  entry,
  date,
  now,
  onDone,
}: {
  entry: EntryData;
  date: string;
  /** Server time (ms), for the default "when you paid". */
  now: number;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const claim = entry.latestClaim;
  const reuse = claim && claim.status !== 'accepted' ? claim : null;
  const form = useForm<ClaimValues>({
    resolver: zodResolver(ClaimSchema),
    defaultValues: {
      senderName: reuse?.senderName ?? '',
      senderBank: reuse?.senderBank ?? '',
      amount: koboToNairaText(reuse?.amountKobo ?? entry.feeKobo),
      paidDate: watDate(new Date(reuse?.paidAt ?? now)),
      paidTime: watTime(new Date(reuse?.paidAt ?? now)),
      transferReference: reuse?.transferReference ?? '',
    },
  });
  const { errors } = form.formState;

  const submit = useMutation(
    api.entries.submitClaim.mutationOptions({
      onSuccess: (updated) => {
        queryClient.setQueryData(api.entries.myDay.queryKey({ input: { date } }), (old) =>
          old ? { ...old, entry: updated } : old,
        );
        void queryClient.invalidateQueries({ queryKey: api.entries.key() });
        onDone?.();
      },
    }),
  );

  const onSubmit = form.handleSubmit((values) => {
    const paidAt = watToUtc(values.paidDate, values.paidTime);
    if (paidAt.getTime() > now + FUTURE_GRACE_MS) {
      form.setError('paidTime', { message: "That time hasn't happened yet." });
      return;
    }
    submit.mutate({
      id: entry.id,
      senderName: values.senderName.trim(),
      senderBank: values.senderBank || undefined,
      amountKobo: nairaToKobo(values.amount),
      paidAt: paidAt.toISOString(),
      transferReference: values.transferReference.trim() || undefined,
    });
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {submit.isError ? <Alert variant="destructive">{errorMessage(submit.error)}</Alert> : null}
      <Field
        label="Name on the account you sent from"
        hint="As it shows in your bank app."
        error={errors.senderName?.message}
      >
        <Input autoComplete="name" {...form.register('senderName')} />
      </Field>
      <Field label="Your bank (optional)" error={errors.senderBank?.message}>
        <Select {...form.register('senderBank')}>
          <option value="">Choose your bank</option>
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank.code} value={bank.name}>
              {bank.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount sent (₦)" error={errors.amount?.message}>
        <Input inputMode="decimal" autoComplete="off" {...form.register('amount')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day you paid" error={errors.paidDate?.message}>
          <Input type="date" {...form.register('paidDate')} />
        </Field>
        <Field label="Time (Lagos)" error={errors.paidTime?.message}>
          <Input type="time" {...form.register('paidTime')} />
        </Field>
      </div>
      <Field
        label="Transfer reference (optional)"
        hint="The session ID or reference from your bank's receipt, if you have it."
        error={errors.transferReference?.message}
      >
        <Input autoComplete="off" {...form.register('transferReference')} />
      </Field>
      <Button type="submit" size="lg" disabled={submit.isPending}>
        {submit.isPending ? 'Sending…' : "I've sent it"}
      </Button>
    </form>
  );
}
