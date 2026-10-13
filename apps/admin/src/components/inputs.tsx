'use client';

import { Input } from '@predict/ui/input';
import { Label } from '@predict/ui/label';
import { cn } from '@predict/ui/utils';
import { useId, type ComponentProps, type ReactNode } from 'react';

/** A naira amount typed as text (parsed exactly with `parseNaira`, never as a float). */
export function NairaInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground"
      >
        ₦
      </span>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn('pl-7 font-mono', className)}
        {...props}
      />
    </div>
  );
}

/** A percentage typed as text, with a % suffix. */
export function PercentInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn('pr-7 font-mono', className)}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-sm text-muted-foreground"
      >
        %
      </span>
    </div>
  );
}

/** A whole number typed as text (keeps empty and partial values editable). */
export function WholeInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={cn('font-mono', className)}
      {...props}
    />
  );
}

/**
 * Separate Lagos (WAT) date and time inputs. Convert with `fromWatInputs(date, time)`;
 * staff always work in Lagos time whatever their device is set to.
 */
export function WatDateTimeInput({
  label,
  date,
  time,
  onDateChange,
  onTimeChange,
  hint,
  error,
  disabled,
  dateOnlyMin,
  dateOnlyMax,
}: {
  label: ReactNode;
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  hint?: ReactNode;
  error?: string;
  disabled?: boolean;
  dateOnlyMin?: string;
  dateOnlyMax?: string;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-semibold">
        {label}{' '}
        <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground">WAT</span>
      </legend>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-date`} className="sr-only">
            Date
          </Label>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            min={dateOnlyMin}
            max={dateOnlyMax}
            onChange={(event) => onDateChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-time`} className="sr-only">
            Time (24-hour, Lagos)
          </Label>
          <Input
            id={`${id}-time`}
            type="time"
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={message ? messageId : undefined}
          />
        </div>
      </div>
      {message ? (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
