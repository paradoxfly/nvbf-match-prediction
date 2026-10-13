import { cn } from '@predict/ui/utils';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

type CalloutVariant = 'info' | 'warning' | 'danger' | 'success';

const STYLES: Record<CalloutVariant, string> = {
  info: 'bg-muted text-foreground',
  warning: 'bg-sg-flash/20 text-foreground',
  danger: 'bg-destructive/10 text-destructive',
  success: 'bg-success/10 text-success',
};

const ICONS = { info: Info, warning: TriangleAlert, danger: CircleAlert, success: CircleCheck };

/** A highlighted note: info, warning (Flash), danger or success. Lists render as bullets. */
export function Callout({
  variant = 'info',
  title,
  items,
  children,
  className,
}: {
  variant?: CalloutVariant;
  title?: ReactNode;
  items?: readonly string[];
  children?: ReactNode;
  className?: string;
}) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'danger' ? 'alert' : undefined}
      className={cn('flex gap-3 rounded-sm px-3.5 py-3 text-sm', STYLES[variant], className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="flex flex-col gap-1">{children}</div> : null}
        {items && items.length > 0 ? (
          <ul className="flex list-disc flex-col gap-0.5 pl-4">
            {items.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
