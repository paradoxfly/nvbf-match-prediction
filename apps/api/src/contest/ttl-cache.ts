import { Injectable } from '@nestjs/common';

/**
 * Tiny in-process cache for hot public reads (home page, day page). Short TTLs keep it honest:
 * a confirmed payment shows up within seconds. Swap for Redis when running several instances.
 */
@Injectable()
export class TtlCache {
  private readonly entries = new Map<string, { expiresAt: number; value: Promise<unknown> }>();

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;
    const value = load();
    this.entries.set(key, { expiresAt: now + ttlMs, value });
    value.catch(() => this.entries.delete(key));
    if (this.entries.size > 500) {
      for (const [k, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(k);
    }
    return value;
  }

  /** Drops every key starting with `prefix` (call after a change the public should see now). */
  invalidate(prefix = '') {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }
}
