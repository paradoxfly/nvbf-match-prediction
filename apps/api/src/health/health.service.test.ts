import type { DatabaseHandle } from '@predict/db';
import { describe, expect, it, vi } from 'vitest';
import { testEnv } from '../../test/support/env';
import { HealthService } from './health.service';

const env = testEnv({ APP_VERSION: '1.0.0' });

describe('HealthService without Redis', () => {
  it('reports Redis as skipped and stays ok when the database is up', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const service = new HealthService(env, { pool } as unknown as DatabaseHandle, null);

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'up', redis: 'skipped' },
    });
  });
});
