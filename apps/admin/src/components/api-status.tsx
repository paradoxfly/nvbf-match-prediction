'use client';

import { Badge } from '@predict/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Dev-only indicator proving the typed web → API path works end to end. */
export function ApiStatus() {
  const health = useQuery(api.system.health.queryOptions());

  if (health.isPending) return <Badge>api · checking</Badge>;
  if (health.isError) return <Badge variant="destructive">api · unreachable</Badge>;

  const { status, version } = health.data;
  return (
    <Badge variant={status === 'ok' ? 'success' : 'accent'}>
      api · {status} · v{version}
    </Badge>
  );
}
