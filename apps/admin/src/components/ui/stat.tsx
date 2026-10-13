import { cn } from '@predict/ui/utils';
import type { ReactNode } from 'react';

/** A data block: mono value over a mono uppercase label (BRAND.md §6). */
export function Stat({
  label,
  value,
  hint,
  emphasis,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Bigger value, for the one number that matters most on the screen. */
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          'font-mono leading-none font-bold tracking-tight',
          emphasis ? 'text-3xl' : 'text-xl',
        )}
      >
        {value}
      </span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** Mono uppercase kicker label. */
export function Kicker({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase',
        className,
      )}
    >
      {children}
    </p>
  );
}
