'use client';

import { cn } from '../lib/utils';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Tap-friendly single or multi choice, rendered as toggle buttons (radio/checkbox semantics
 * via aria-pressed).
 */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly ChipOption<T>[];
  value: readonly T[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              selected
                ? 'border-sg-night bg-sg-night text-sg-flash'
                : 'border-sg-night/15 bg-background hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
