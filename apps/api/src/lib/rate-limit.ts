import { TokenBucket } from '@plantpal/providers';

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

/** Token-bucket limiter keyed by client (IP) — in production backed by the `Limiter` Durable Object. */
export interface RateLimiter {
  take(key: string): Promise<LimitResult>;
}

export const CLIENT_LIMIT = { capacity: 120, ratePerSecond: 2 };

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  constructor(
    private readonly capacity = CLIENT_LIMIT.capacity,
    private readonly ratePerSecond = CLIENT_LIMIT.ratePerSecond,
    private readonly now: () => number = Date.now,
  ) {}
  async take(key: string): Promise<LimitResult> {
    let b = this.buckets.get(key);
    if (!b) {
      b = new TokenBucket(this.capacity, this.ratePerSecond, this.now);
      this.buckets.set(key, b);
    }
    const wait = b.take();
    return {
      allowed: wait === 0,
      remaining: Math.floor(b.snapshot().tokens),
      retryAfterMs: wait,
      limit: this.capacity,
    };
  }
}
