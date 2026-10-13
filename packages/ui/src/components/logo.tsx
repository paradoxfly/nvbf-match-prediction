import { product } from '@predict/brand';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

const SWOOP =
  'M34 42 C34 32, 44 26, 58 26 C72 26, 82 32, 82 42 C82 52, 72 56, 58 60 C44 64, 34 68, 34 78 C34 88, 44 94, 58 94 C72 94, 86 88, 92 80';

/** The Flight-S mark (BRAND.md §2), inline so it needs no asset pipeline. */
export function LogoMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={product.name}
      className={cn('size-8', className)}
      {...props}
    >
      <rect x="6" y="6" width="108" height="108" rx="32" fill="var(--sg-night)" />
      <path d={SWOOP} stroke="var(--sg-flash)" strokeWidth="10" strokeLinecap="round" fill="none" />
      <circle cx="34" cy="42" r="6" fill="var(--sg-flash)" />
      <circle cx="92" cy="80" r="8" fill="var(--sg-flash)" />
      <circle cx="92" cy="80" r="3" fill="var(--sg-night)" />
    </svg>
  );
}

/** Mark + product wordmark with the Flash dot (the product name lives in @predict/brand). */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} {...props}>
      <LogoMark aria-hidden className="size-8" />
      <span className="text-xl font-black tracking-[-0.04em]">
        {product.wordmark}
        <span className="text-sg-flash">.</span>
      </span>
    </span>
  );
}
