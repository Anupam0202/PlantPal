import { describe, expect, it, vi } from 'vitest';
import {
  CircuitBreaker,
  fetchJson,
  formatCoordinates,
  ProviderError,
  roundCoords,
  TokenBucket,
  cacheKey,
} from '../src';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('fetchJson', () => {
  it('returns JSON and latency', async () => {
    const r = await fetchJson('https://x.test', {
      provider: 'p',
      deadlineMs: 1000,
      fetch: async () => json({ a: 1 }),
    });
    expect(r.json).toEqual({ a: 1 });
  });

  it('aborts at the deadline instead of hanging', async () => {
    const never: typeof fetch = (_u, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
      );
    const t = Date.now();
    await expect(
      fetchJson('https://x.test', { provider: 'p', deadlineMs: 80, retries: 0, fetch: never }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('retries a 5xx once with jittered backoff, but not a 4xx', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x', { status: 503 }))
      .mockResolvedValueOnce(json({ ok: true }));
    await expect(
      fetchJson('https://x.test', {
        provider: 'p',
        deadlineMs: 2000,
        fetch: f,
        sleep: async () => {},
        random: () => 0.5,
      }),
    ).resolves.toMatchObject({ json: { ok: true } });
    expect(f).toHaveBeenCalledTimes(2);

    const g = vi.fn<typeof fetch>().mockResolvedValue(new Response('x', { status: 400 }));
    await expect(
      fetchJson('https://x.test', { provider: 'p', deadlineMs: 2000, fetch: g, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'HTTP', status: 400 });
    expect(g).toHaveBeenCalledTimes(1);
  });

  it('honours Retry-After only when it fits in the deadline', async () => {
    const slept: number[] = [];
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(json({ ok: 1 }));
    await fetchJson('https://x.test', {
      provider: 'p',
      deadlineMs: 5000,
      fetch: f,
      sleep: async (ms) => void slept.push(ms),
    });
    expect(slept).toEqual([1000]);
    const h = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '60' } }));
    await expect(
      fetchJson('https://x.test', { provider: 'p', deadlineMs: 2000, fetch: h, sleep: async () => {} }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 60000 });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('reports bad JSON and network failures distinctly', async () => {
    await expect(
      fetchJson('https://x.test', {
        provider: 'p',
        deadlineMs: 500,
        fetch: async () => new Response('<html>'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(
      fetchJson('https://x.test', {
        provider: 'p',
        deadlineMs: 500,
        retries: 0,
        fetch: async () => Promise.reject(new TypeError('Failed to fetch')),
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('can be cancelled', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      fetchJson('https://x.test', {
        provider: 'p',
        deadlineMs: 500,
        signal: ctrl.signal,
        fetch: async () => json({}),
      }),
    ).rejects.toMatchObject({ code: 'ABORTED' });
  });
});

describe('circuit breaker and token bucket', () => {
  it('opens after repeated failures and half-opens after the cooldown', () => {
    let t = 0;
    const c = new CircuitBreaker(3, 1000, () => t);
    c.failure();
    c.failure();
    expect(c.allow()).toBe(true);
    c.failure();
    expect(c.state).toBe('open');
    expect(c.allow()).toBe(false);
    t = 1000;
    expect(c.state).toBe('half-open');
    expect(c.allow()).toBe(true);
    expect(c.allow()).toBe(false);
    c.success();
    expect(c.state).toBe('closed');
  });

  it('limits bursts and refills over time', () => {
    let t = 0;
    const b = new TokenBucket(2, 1, () => t);
    expect(b.take()).toBe(0);
    expect(b.take()).toBe(0);
    expect(b.take()).toBe(1000);
    t = 1000;
    expect(b.take()).toBe(0);
  });
});

describe('coordinates', () => {
  it('rounds for privacy and cache hits', () => {
    expect(roundCoords(18.52043, 73.85674, 0.05)).toEqual({ lat: 18.5, lon: 73.85 });
    expect(roundCoords(-33.8679, 151.2073, 0.1)).toEqual({ lat: -33.9, lon: 151.2 });
    expect(roundCoords(-0.001, -0.001, 0.05)).toEqual({ lat: 0, lon: 0 });
  });

  it('formats each hemisphere correctly', () => {
    expect(formatCoordinates(18.5204, 73.8567)).toBe('18.52° N, 73.86° E');
    expect(formatCoordinates(-33.8679, 151.2073)).toBe('33.87° S, 151.21° E');
    expect(formatCoordinates(40.7128, -74.006)).toBe('40.71° N, 74.01° W');
    expect(formatCoordinates(-12.0464, -77.0428)).toBe('12.05° S, 77.04° W');
  });

  it('builds stable cache keys', () => {
    expect(cacheKey('a', 'b', 'v1', { lon: 2, lat: 1, x: undefined })).toBe('a|b|v1|lat=1&lon=2');
  });
});

describe('ProviderError', () => {
  it('knows what is retryable', () => {
    expect(new ProviderError('TIMEOUT', 'p', '').retryable).toBe(true);
    expect(new ProviderError('HTTP', 'p', '', 502).retryable).toBe(true);
    expect(new ProviderError('HTTP', 'p', '', 404).retryable).toBe(false);
    expect(new ProviderError('BAD_RESPONSE', 'p', '').retryable).toBe(false);
  });
});
