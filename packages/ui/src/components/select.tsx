import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

/** Native select: accessible, mobile-friendly pickers, styled to match Input. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-10 w-full min-w-0 appearance-none rounded-sm border border-input bg-sg-surface/60 bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%221.5%22%20d%3D%22M4%206l4%204%204-4%22/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9 pl-3 text-sm outline-none focus-visible:border-sg-night/30 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
