import { cn } from '@predict/ui/utils';
import type { ComponentProps } from 'react';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-sm bg-muted', className)} {...props} />
  );
}

/** A few placeholder rows while a list loads. */
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}
