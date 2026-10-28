import { ProviderError } from './errors';

export interface HttpOptions {
  provider: string;
  /** Total time budget for the call, retries included. */
  deadlineMs: number;
  /** Extra attempts for retryable failures (default 1, so at most 2 attempts). */
  retries?: number;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface HttpResult {
  json: unknown;
  status: number;
  latencyMs: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseRetryAfter(h: string | null, now: number): number | undefined {
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

/**
 * GET a JSON document with a hard deadline, cancellation, and bounded, jittered retries for retryable
 * failures only (timeouts, network errors, 429 with a short Retry-After, 5xx).
 */
export async function fetchJson(url: string, opts: HttpOptions): Promise<HttpResult> {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const now = opts.now ?? Date.now;
  const retries = opts.retries ?? 1;
  const start = now();
  const deadline = start + opts.deadlineMs;

  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0)
      throw new ProviderError('TIMEOUT', opts.provider, `Deadline of ${opts.deadlineMs} ms exceeded`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), remaining);
    const onAbort = () => controller.abort(opts.signal?.reason);
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    let error: ProviderError;
    try {
      if (opts.signal?.aborted) throw new ProviderError('ABORTED', opts.provider, 'Cancelled');
      const res = await doFetch(url, {
        headers: { Accept: 'application/json', ...opts.headers },
        signal: controller.signal,
      });
      if (res.ok) {
        let json: unknown;
        try {
          json = await res.json();
        } catch {
          throw new ProviderError('BAD_RESPONSE', opts.provider, 'Response was not valid JSON', res.status);
        }
        return { json, status: res.status, latencyMs: now() - start };
      }
      if (res.status === 429) {
        error = new ProviderError(
          'RATE_LIMITED',
          opts.provider,
          'Rate limited',
          429,
          parseRetryAfter(res.headers.get('retry-after'), now()),
        );
      } else {
        error = new ProviderError('HTTP', opts.provider, `HTTP ${res.status}`, res.status);
      }
    } catch (e) {
      if (e instanceof ProviderError) {
        if (e.code === 'BAD_RESPONSE' || e.code === 'ABORTED') throw e;
        error = e;
      } else if (opts.signal?.aborted) {
        throw new ProviderError('ABORTED', opts.provider, 'Cancelled');
      } else if (controller.signal.aborted) {
        error = new ProviderError('TIMEOUT', opts.provider, `Deadline of ${opts.deadlineMs} ms exceeded`);
      } else {
        error = new ProviderError('NETWORK', opts.provider, e instanceof Error ? e.message : 'Network error');
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }

    if (!error.retryable || attempt >= retries) throw error;
    // Exponential backoff with full jitter, or the server's Retry-After when it fits in the budget.
    const backoff = error.retryAfterMs ?? Math.round(random() * 250 * 2 ** attempt);
    if (now() + backoff >= deadline) throw error;
    await sleep(backoff);
  }
}
