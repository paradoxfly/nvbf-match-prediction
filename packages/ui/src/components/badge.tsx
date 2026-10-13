import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

// Mono, uppercase, wide-tracked labels (BRAND.md §4 "Label").
export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[2px] uppercase whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        accent: 'bg-accent text-accent-foreground',
        muted: 'bg-muted text-muted-foreground',
        success: 'bg-success/10 text-success',
        destructive: 'bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { variant: 'muted' },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
