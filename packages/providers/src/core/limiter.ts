/** Token bucket: `capacity` tokens, refilled at `ratePerSecond`. Pure and clock-injectable. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly capacity: number,
    private readonly ratePerSecond: number,
    private readonly now: () => number = Date.now,
    initial?: { tokens: number; last: number },
  ) {
    this.tokens = initial?.tokens ?? capacity;
    this.last = initial?.last ?? now();
  }

  private refill(): void {
    const t = this.now();
    const elapsed = Math.max(0, t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSecond);
    this.last = t;
  }

  /** Takes `n` tokens if available. Returns 0 on success, otherwise milliseconds until enough tokens exist. */
  take(n = 1): number {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return 0;
    }
    return Math.ceil(((n - this.tokens) / this.ratePerSecond) * 1000);
  }

  snapshot(): { tokens: number; last: number } {
    this.refill();
    return { tokens: this.tokens, last: this.last };
  }
}
