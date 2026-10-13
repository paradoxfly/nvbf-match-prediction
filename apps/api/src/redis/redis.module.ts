import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/** A connected-on-demand Redis client, or `null` when `REDIS_URL` is not configured. */
export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

function createRedis(url: string | undefined): Redis | null {
  if (!url) {
    logger.warn('REDIS_URL is not set; Redis-backed features are disabled.');
    return null;
  }
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  // Without a listener ioredis reports every failed reconnect as an unhandled error.
  let lastLoggedAt = 0;
  redis.on('error', (error) => {
    if (Date.now() - lastLoggedAt < 30_000) return;
    lastLoggedAt = Date.now();
    logger.warn(`Connection problem: ${error.message}`);
  });
  return redis;
}

@Global()
@Module({
  providers: [
    { provide: REDIS, inject: [ENV], useFactory: (env: Env) => createRedis(env.REDIS_URL) },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  async onApplicationShutdown() {
    if (this.redis && this.redis.status !== 'end' && this.redis.status !== 'wait') {
      await this.redis.quit().catch(() => undefined);
    }
  }
}
