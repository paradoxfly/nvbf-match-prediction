'use client';

import { Button } from '@predict/ui/button';
import { cn } from '@predict/ui/utils';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and some in-app browsers block the clipboard API: fall back to a selection.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(field);
      return copied;
    } catch {
      return false;
    }
  }
}

/** Copies `value` and says so for two seconds. `label` names what is copied, for screen readers. */
export function CopyButton({
  value,
  label,
  className,
  variant = 'outline',
}: {
  value: string;
  label: string;
  className?: string;
  variant?: 'outline' | 'secondary' | 'accent';
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={variant}
        className={cn('min-w-[5.5rem]', className)}
        onClick={async () => setState((await copyText(value)) ? 'copied' : 'failed')}
      >
        {state === 'copied' ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Try again' : 'Copy'}
        <span className="sr-only"> {label}</span>
      </Button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied'
          ? `${label} copied`
          : state === 'failed'
            ? `Could not copy ${label}`
            : ''}
      </span>
    </>
  );
}
