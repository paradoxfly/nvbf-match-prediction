import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';

export function ProgressBar({
  value,
  className,
  label,
  ...props
}: { value: number; label: string } & ComponentProps<'div'>) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-sg-flash transition-[width]"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** A percentage ring with the number in the middle, e.g. profile completion. */
export function ProgressRing({
  value,
  size = 96,
  label,
  className,
}: {
  value: number;
  size?: number;
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const stroke = size / 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--sg-surface)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--sg-night)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="absolute font-mono text-lg font-bold">{Math.round(clamped)}%</span>
    </div>
  );
}
