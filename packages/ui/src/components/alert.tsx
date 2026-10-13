import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const alertVariants = cva('rounded-sm px-3 py-2.5 text-sm', {
  variants: {
    variant: {
      info: 'bg-muted text-foreground',
      success: 'bg-success/10 text-success',
      destructive: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'info' },
});

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}
