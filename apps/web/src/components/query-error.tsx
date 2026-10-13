'use client';

import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { errorMessage } from '@/lib/errors';

/** A failed request: the friendly message, and a retry button when there is something to retry. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
      <span>{errorMessage(error)}</span>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </Alert>
  );
}
