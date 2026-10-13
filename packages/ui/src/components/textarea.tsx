import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-24 w-full rounded-sm border border-input bg-sg-surface/60 px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-sg-night/30 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
