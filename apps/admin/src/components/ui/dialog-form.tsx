'use client';

import { Button } from '@predict/ui/button';
import { DialogClose, DialogDescription, DialogTitle } from '@predict/ui/dialog';
import { cn } from '@predict/ui/utils';
import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/error-alert';

/**
 * The inside of a form dialog: title, description, fields, the API error and Cancel/Submit.
 * Render it inside `<DialogContent>` so its state resets each time the dialog opens.
 */
export function DialogForm({
  title,
  description,
  children,
  submitLabel,
  pendingLabel = 'Saving…',
  pending = false,
  canSubmit = true,
  error,
  destructive = false,
  onSubmit,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  canSubmit?: boolean;
  error?: unknown;
  destructive?: boolean;
  onSubmit: () => void;
  className?: string;
}) {
  return (
    <form
      noValidate
      className={cn('flex flex-col gap-4', className)}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !pending) onSubmit();
      }}
    >
      <div className="flex flex-col gap-1 pr-8">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={description ? undefined : 'sr-only'}>
          {description ?? title}
        </DialogDescription>
      </div>
      {children}
      <ErrorAlert error={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant={destructive ? 'destructive' : 'default'}
          disabled={!canSubmit || pending}
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
