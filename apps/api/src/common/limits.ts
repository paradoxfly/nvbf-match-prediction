import { DomainError } from './domain-error';
import type { RateLimitRule, RateLimitService } from './rate-limit.service';

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Counts a hit against the rules and throws RATE_LIMITED (with retryAfterSec) if over. */
export async function enforceLimits(limits: RateLimitService, rules: RateLimitRule[]) {
  const result = await limits.consume(rules);
  if (!result.allowed) {
    throw new DomainError('RATE_LIMITED', { retryAfterSec: result.retryAfterSec });
  }
}
