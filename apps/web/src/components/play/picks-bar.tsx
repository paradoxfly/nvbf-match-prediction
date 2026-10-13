'use client';

import { Button } from '@predict/ui/button';
import { cn } from '@predict/ui/utils';
import { errorMessage } from '@/lib/errors';

/**
 * Sticky save bar. On phones it sits just above the bottom tab bar (about 72px plus the
 * safe area); from md up the tab bar is gone, so it sits at the bottom of the window.
 */
export function PicksBar({
  picked,
  total,
  toSave,
  toFix,
  rejected,
  pending,
  error,
  announcement,
  onSave,
}: {
  picked: number;
  total: number;
  toSave: number;
  toFix: number;
  /** Picks the server turned down (each card says why). */
  rejected: number;
  pending: boolean;
  error: unknown;
  announcement: string;
  onSave: () => void;
}) {
  let status: string;
  let tone = 'text-muted-foreground';
  if (pending) status = 'Saving your picks…';
  else if (error) {
    status = errorMessage(error);
    tone = 'text-destructive';
  } else if (rejected > 0) {
    status = `${rejected} couldn't be saved: see the ${rejected === 1 ? 'match' : 'matches'}`;
    tone = 'text-destructive';
  } else if (toSave > 0 || toFix > 0) {
    const parts: string[] = [];
    if (toSave > 0) parts.push(`${toSave} not saved yet`);
    if (toFix > 0) parts.push(`${toFix} to fix`);
    status = parts.join(' · ');
    tone = toFix > 0 && toSave === 0 ? 'text-destructive' : 'text-foreground';
  } else status = picked > 0 ? 'All your picks are saved' : 'Pick a result to start';

  return (
    <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 backdrop-blur md:bottom-0">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold">
            {picked}/{total} <span className="font-sans font-semibold">picked</span>
          </p>
          <p className={cn('truncate text-xs', tone)}>{status}</p>
        </div>
        <Button size="lg" onClick={onSave} disabled={pending || toSave === 0} className="shrink-0">
          {pending ? 'Saving…' : 'Save picks'}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
