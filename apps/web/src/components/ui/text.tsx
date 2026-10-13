import { cn } from '@predict/ui/utils';
import type { ComponentProps, ReactNode } from 'react';

/** Mono, uppercase, wide-tracked label (BRAND.md §4 "Label"). */
export function Kicker({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase',
        className,
      )}
      {...props}
    />
  );
}

/** Stat-over-label data block: a big mono number above a kicker. */
export function Stat({
  value,
  label,
  className,
  valueClassName,
  labelClassName,
}: {
  value: ReactNode;
  label: ReactNode;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={cn('font-mono text-xl leading-none font-bold', valueClassName)}>
        {value}
      </span>
      <span
        className={cn(
          'font-mono text-[10px] font-medium tracking-[1px] text-muted-foreground uppercase',
          labelClassName,
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** Page title block: kicker, lowercase headline and an optional intro line. */
export function PageHeader({
  kicker,
  title,
  children,
  actions,
  className,
}: {
  kicker?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-2">
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h1 className="text-3xl leading-none font-black tracking-[-1px]">{title}</h1>
        {children ? <div className="max-w-xl text-sm text-muted-foreground">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A section heading inside a page. */
export function SectionTitle({
  title,
  kicker,
  action,
  id,
}: {
  title: string;
  kicker?: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h2 id={id} className="text-xl leading-tight font-extrabold tracking-[-0.5px]">
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}
