import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse } from '@predict/contracts';
import type { DatabaseHandle } from '@predict/db';
import type { Redis } from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB_HANDLE } from '../database/database.module';
import { REDIS } from '../redis/redis.module';

const CHECK_TIMEOUT_MS = 2_000;

async function probe(check: () => Promise<unknown>): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DB_HANDLE) private readonly database: DatabaseHandle,
    @Inject(REDIS) private readonly redis: Redis | null,
  ) {}

  async check(): Promise<HealthResponse> {
    const redisClient = this.redis;
    const [database, redis] = await Promise.all([
      probe(() => this.database.pool.query('select 1')),
      redisClient
        ? probe(async () => {
            if (redisClient.status === 'wait') await redisClient.connect();
            return redisClient.ping();
          })
        : Promise.resolve('skipped' as const),
    ]);

    return {
      status: database === 'up' && redis !== 'down' ? 'ok' : 'degraded',
      version: this.env.APP_VERSION,
      uptimeSec: Math.round(process.uptime()),
      checks: { database, redis },
    };
  }
}
