import { cn } from '@predict/ui/utils';
import type { ComponentProps } from 'react';

/** A quiet placeholder block while data loads. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />
  );
}

/** A loading region announced once to screen readers, with placeholder blocks inside. */
export function LoadingBlocks({ label = 'Loading', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={index === 0 ? 'h-48' : 'h-28'} />
      ))}
    </div>
  );
}
