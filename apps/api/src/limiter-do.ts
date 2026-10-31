import { DurableObject } from 'cloudflare:workers';
import { TokenBucket } from '@plantpal/providers';
import { CLIENT_LIMIT, type Limit, type LimitResult, type RateLimiter } from './lib/rate-limit';

/** Global token buckets (one Durable Object per key shard). */
export class Limiter extends DurableObject {
  async take(key: string, capacity: number, ratePerSecond: number): Promise<LimitResult> {
    const snap = await this.ctx.storage.get<{ tokens: number; last: number }>(key);
    const bucket = new TokenBucket(capacity, ratePerSecond, Date.now, snap);
    const wait = bucket.take();
    await this.ctx.storage.put(key, bucket.snapshot());
    return {
      allowed: wait === 0,
      remaining: Math.floor(bucket.snapshot().tokens),
      retryAfterMs: wait,
      limit: capacity,
    };
  }
}

export class DurableRateLimiter implements RateLimiter {
  constructor(private readonly ns: DurableObjectNamespace<Limiter>) {}
  async take(key: string, limit: Limit = CLIENT_LIMIT): Promise<LimitResult> {
    // Shard by key so one hot client cannot slow everyone else down.
    const stub = this.ns.get(this.ns.idFromName(key.slice(0, 64)));
    return stub.take(key, limit.capacity, limit.ratePerSecond);
  }
}
