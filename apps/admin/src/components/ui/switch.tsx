'use client';

import { Label } from '@predict/ui/label';
import { cn } from '@predict/ui/utils';
import { useId, type ComponentProps, type ReactNode } from 'react';

/** An on/off toggle (role="switch"). */
export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-sg-night' : 'bg-sg-night/20',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'size-5 rounded-full shadow-card transition-transform',
          checked ? 'translate-x-[22px] bg-sg-flash' : 'translate-x-0.5 bg-background',
        )}
      />
    </button>
  );
}

/** A labelled switch row with an optional description. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description ? (
          <p id={`${id}-description`} className="text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
      />
    </div>
  );
}
