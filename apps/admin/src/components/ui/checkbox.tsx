'use client';

import { cn } from '@predict/ui/utils';
import type { ComponentProps, ReactNode } from 'react';

/** Native checkbox in brand colours. */
export function Checkbox({
  className,
  onCheckedChange,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { onCheckedChange?: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-sm accent-sg-night outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  );
}

/** A checkbox with its label (and optional hint) as one click target. */
export function CheckboxField({
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
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 text-sm',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <Checkbox
        className="mt-0.5"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}
