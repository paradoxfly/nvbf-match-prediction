import { oc } from '@orpc/contract';
import { z } from 'zod';

export const DependencyStatus = z.enum(['up', 'down', 'skipped']);

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSec: z.number(),
  checks: z.object({
    database: DependencyStatus,
    redis: DependencyStatus,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const systemContract = {
  health: oc
    .route({ method: 'GET', path: '/health', tags: ['system'], summary: 'Service health' })
    .output(HealthResponse),
};
