export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Per-provider circuit breaker: after `threshold` consecutive failures the circuit opens and calls fail
 * fast for `cooldownMs`; then a single trial call is allowed (half-open).
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;

  constructor(
    private readonly threshold = 4,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): CircuitState {
    if (this.openedAt === null) return 'closed';
    return this.now() - this.openedAt >= this.cooldownMs ? 'half-open' : 'open';
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  /** Returns false when the call must fail fast. */
  allow(): boolean {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'half-open' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  success(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  failure(): void {
    this.failures++;
    this.trialInFlight = false;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}
