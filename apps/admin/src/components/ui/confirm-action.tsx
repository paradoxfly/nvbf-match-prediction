'use client';

import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Textarea } from '@predict/ui/textarea';
import { useState, type ReactElement, type ReactNode } from 'react';
import { DialogForm } from '@/components/ui/dialog-form';

interface ReasonOptions {
  label?: string;
  placeholder?: string;
  hint?: string;
}

interface ConfirmActionProps {
  /** The button that opens the dialog. Omit when controlling `open` yourself. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra content between the description and the buttons (warnings, checkboxes…). */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  destructive?: boolean;
  /** Ask for a reason (at least 3 characters; it goes into the audit log). */
  reason?: boolean | ReasonOptions;
  /** Block the confirm button (e.g. until a checkbox is ticked). */
  confirmDisabled?: boolean;
  /** Runs the action; resolve to close the dialog, reject to show the error. */
  onConfirm: (reason: string) => Promise<unknown>;
}

/** Confirmation for irreversible or audited actions, optionally collecting a reason. */
export function ConfirmAction({ trigger, open, onOpenChange, ...props }: ConfirmActionProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const isOpen = open ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <ConfirmBody {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = 'Working…',
  destructive,
  reason,
  confirmDisabled,
  onConfirm,
  onDone,
}: Omit<ConfirmActionProps, 'trigger' | 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const options: ReasonOptions | null = reason ? (reason === true ? {} : reason) : null;
  const reasonOk = !options || text.trim().length >= 3;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      setPending(false);
      onDone();
    } catch (caught) {
      setPending(false);
      setError(caught);
    }
  }

  return (
    <DialogForm
      title={title}
      description={description}
      submitLabel={confirmLabel}
      pendingLabel={pendingLabel}
      pending={pending}
      canSubmit={reasonOk && !confirmDisabled}
      error={error}
      destructive={destructive}
      onSubmit={() => void submit()}
    >
      {children}
      {options ? (
        <Field
          label={options.label ?? 'Reason'}
          hint={options.hint ?? 'At least 3 characters. It is saved in the audit log.'}
        >
          <Textarea
            value={text}
            maxLength={500}
            placeholder={options.placeholder}
            onChange={(event) => setText(event.target.value)}
            className="min-h-20"
          />
        </Field>
      ) : null}
    </DialogForm>
  );
}
