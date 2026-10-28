export type ProviderErrorCode =
  'TIMEOUT' | 'NETWORK' | 'HTTP' | 'RATE_LIMITED' | 'BAD_RESPONSE' | 'CIRCUIT_OPEN' | 'DISABLED' | 'ABORTED';

/** A typed provider failure. Only `retryable` errors are retried. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    readonly provider: string,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get retryable(): boolean {
    return (
      this.code === 'TIMEOUT' ||
      this.code === 'NETWORK' ||
      this.code === 'RATE_LIMITED' ||
      (this.code === 'HTTP' && (this.status ?? 0) >= 500)
    );
  }
}
