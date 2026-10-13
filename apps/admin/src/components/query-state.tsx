'use client';

import { ErrorState } from '@predict/ui/states';
import type { ReactNode } from 'react';
import { SkeletonList } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/errors';

interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  refetch: () => unknown;
}

/**
 * Renders a loading skeleton, a retryable error, or `children(data)`. Keeps showing stale data
 * (with no error box) when a background refetch fails.
 */
export function QueryState<T>({
  query,
  children,
  loading,
  errorTitle = 'Could not load this',
}: {
  query: QueryLike<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  errorTitle?: string;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isPending && !query.error) return <>{loading ?? <SkeletonList />}</>;
  return (
    <ErrorState
      title={errorTitle}
      description={errorMessage(query.error)}
      onRetry={() => void query.refetch()}
    />
  );
}

/** Shown when the signed-in role can't use a page at all. */
export function NoAccess({ what }: { what: string }) {
  return (
    <ErrorState
      title="Not available for your role"
      description={`Ask a super admin if you need access to ${what}.`}
    />
  );
}
