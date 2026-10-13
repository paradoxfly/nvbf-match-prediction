import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import { cn } from '../lib/utils';
import { Label } from './label';

/**
 * Label + control + hint/error, wired for accessibility: the control gets the id,
 * `aria-invalid` and `aria-describedby` automatically.
 */
export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': message ? messageId : undefined,
      })}
      {message ? (
        <p
          id={messageId}
          className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
