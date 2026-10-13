import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module';

export interface RateLimitRule {
  /** Unique bucket key, e.g. `login:ip:1.2.3.4`. */
  key: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Fixed-window counters. Uses Redis when configured (shared between API instances, survives
 * restarts) and process memory otherwise. If Redis fails mid-flight the memory counters take
 * over, so limits keep applying on this instance instead of failing open everywhere.
 */
@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly sweeper = setInterval(() => this.sweep(), 60_000).unref();

  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  /** Counts one hit against every rule; denied if any rule is over its limit. */
  async consume(rules: RateLimitRule[]): Promise<RateLimitResult> {
    if (this.redis) {
      try {
        return await this.consumeRedis(this.redis, rules);
      } catch (error) {
        this.logger.warn(`Redis rate limit failed, using memory: ${(error as Error).message}`);
      }
    }
    return this.consumeMemory(rules);
  }

  reset() {
    this.buckets.clear();
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  private async consumeRedis(redis: Redis, rules: RateLimitRule[]): Promise<RateLimitResult> {
    if (redis.status === 'wait') await redis.connect();
    const pipeline = redis.multi();
    for (const rule of rules) {
      const key = `rl:${rule.key}`;
      pipeline.incr(key).expire(key, rule.windowSec, 'NX').ttl(key);
    }
    const replies = (await pipeline.exec()) ?? [];
    let retryAfterSec = 0;
    rules.forEach((rule, index) => {
      const count = Number(replies[index * 3]?.[1] ?? 0);
      const ttl = Number(replies[index * 3 + 2]?.[1] ?? rule.windowSec);
      if (count > rule.limit) retryAfterSec = Math.max(retryAfterSec, Math.max(ttl, 1));
    });
    return retryAfterSec > 0
      ? { allowed: false, retryAfterSec }
      : { allowed: true, retryAfterSec: 0 };
  }

  private consumeMemory(rules: RateLimitRule[]): RateLimitResult {
    const now = Date.now();
    let retryAfterMs = 0;

    for (const rule of rules) {
      const bucket = this.buckets.get(rule.key);
      if (!bucket || bucket.resetAt <= now) {
        this.buckets.set(rule.key, { count: 1, resetAt: now + rule.windowSec * 1000 });
        if (rule.limit < 1) retryAfterMs = Math.max(retryAfterMs, rule.windowSec * 1000);
        continue;
      }
      bucket.count += 1;
      if (bucket.count > rule.limit) retryAfterMs = Math.max(retryAfterMs, bucket.resetAt - now);
    }

    return retryAfterMs > 0
      ? { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
      : { allowed: true, retryAfterSec: 0 };
  }

  private sweep() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(key);
  }
}
