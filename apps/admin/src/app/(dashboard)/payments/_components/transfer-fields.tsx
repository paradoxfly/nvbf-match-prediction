'use client';

import type { BankTransferInput } from '@predict/contracts';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Textarea } from '@predict/ui/textarea';
import { NairaInput, WatDateTimeInput } from '@/components/inputs';
import { formatNaira, fromWatInputs, parseNaira } from '@/lib/format';
import { useNow } from '@/lib/hooks';

/** A transfer as typed from the bank statement. */
export interface TransferDraft {
  bankReference: string;
  amount: string;
  date: string;
  time: string;
  senderName: string;
  narration: string;
  note: string;
}

export const emptyTransfer = (patch: Partial<TransferDraft> = {}): TransferDraft => ({
  bankReference: '',
  amount: '',
  date: '',
  time: '',
  senderName: '',
  narration: '',
  note: '',
  ...patch,
});

type TransferErrors = Partial<Record<'amount' | 'creditedAt' | 'note', string>>;

/** The API refuses credited times more than 5 minutes ahead of its clock. */
const FUTURE_SLACK_MS = 5 * 60_000;

/** Validates the draft against `now` (ms); `input` is ready to send (dates as ISO strings). */
export function parseTransfer(
  draft: TransferDraft,
  now: number,
): {
  input: (Omit<BankTransferInput, 'creditedAt'> & { creditedAt: string }) | null;
  errors: TransferErrors;
} {
  const errors: TransferErrors = {};
  const amount = parseNaira(draft.amount, { min: 1 });
  if (amount.error) errors.amount = amount.error;
  const creditedAt = fromWatInputs(draft.date, draft.time);
  if (!creditedAt) errors.creditedAt = 'Enter the date and time the money arrived.';
  else if (new Date(creditedAt).getTime() > now + FUTURE_SLACK_MS) {
    errors.creditedAt = 'That is in the future. Use the time on the bank statement.';
  }
  const reference = draft.bankReference.trim();
  if (!reference && !draft.note.trim()) {
    errors.note = 'No bank reference (e.g. a cash deposit)? Say so here.';
  }
  if (Object.keys(errors).length > 0 || amount.kobo === null || !creditedAt) {
    return { input: null, errors };
  }
  return {
    input: {
      bankReference: reference || undefined,
      amountKobo: amount.kobo,
      creditedAt,
      senderName: draft.senderName.trim() || undefined,
      narration: draft.narration.trim() || undefined,
      note: draft.note.trim() || undefined,
    },
    errors,
  };
}

/** The bank-statement fields shared by "Confirm payment" and "Record transfer". */
export function TransferFields({
  draft,
  onChange,
  showErrors,
  expectedKobo,
}: {
  draft: TransferDraft;
  onChange: (draft: TransferDraft) => void;
  showErrors: boolean;
  /** The entry fee, to flag a different amount. */
  expectedKobo?: number;
}) {
  const now = useNow(30_000);
  const { errors } = parseTransfer(draft, now);
  const amount = parseNaira(draft.amount, { min: 1 }).kobo;
  const set = (patch: Partial<TransferDraft>) => onChange({ ...draft, ...patch });
  const amountHint =
    expectedKobo !== undefined && amount !== null && amount !== expectedKobo
      ? amount > expectedKobo
        ? `More than the ${formatNaira(expectedKobo)} fee: the rest stays as unused money on the transfer.`
        : `Less than the ${formatNaira(expectedKobo)} fee: this can't confirm the entry.`
      : 'Exactly as on the statement.';

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Bank reference / session ID"
        hint="From the statement line. Each reference can only be recorded once."
      >
        <Input
          value={draft.bankReference}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          onChange={(event) => set({ bankReference: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Amount received"
          hint={amountHint}
          error={showErrors ? errors.amount : undefined}
        >
          <NairaInput
            value={draft.amount}
            onChange={(event) => set({ amount: event.target.value })}
          />
        </Field>
        <Field label="Sender name" hint="As the statement shows it.">
          <Input
            value={draft.senderName}
            maxLength={120}
            onChange={(event) => set({ senderName: event.target.value })}
          />
        </Field>
      </div>
      <WatDateTimeInput
        label="Credited at"
        date={draft.date}
        time={draft.time}
        onDateChange={(date) => set({ date })}
        onTimeChange={(time) => set({ time })}
        hint="When the money reached our account. It decides whether the entry counts."
        error={showErrors ? errors.creditedAt : undefined}
      />
      <Field label="Narration" hint="Optional: the transfer description, if it shows one.">
        <Input
          value={draft.narration}
          maxLength={200}
          onChange={(event) => set({ narration: event.target.value })}
        />
      </Field>
      <Field
        label="Note"
        hint="Optional for transfers; required without a bank reference."
        error={showErrors ? errors.note : undefined}
      >
        <Textarea
          value={draft.note}
          maxLength={500}
          className="min-h-16"
          onChange={(event) => set({ note: event.target.value })}
        />
      </Field>
    </div>
  );
}
