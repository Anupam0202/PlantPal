import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { Forecast, PlaceSearch, Problem } from '@plantpal/schemas';
import { createApp } from '../src/app';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { D1StatusStore, MemoryStatusStore } from '../src/lib/status-store';
import { createD1 } from './d1-shim';

function make(
  opts: { fetch?: typeof fetch; mode?: 'live' | 'mock'; capacity?: number; status?: MemoryStatusStore } = {},
) {
  const status = opts.status ?? new MemoryStatusStore();
  const env = new EnvClient({
    mode: opts.mode ?? 'mock',
    cache: new MemoryCache(),
    fetch: opts.fetch,
    sleep: async () => {},
    onStatus: (e) => void status.record(e),
  });
  const app = createApp({
    env,
    status,
    limiter: new MemoryRateLimiter(opts.capacity ?? 100, 1),
    mode: opts.mode ?? 'mock',
    allowedOrigins: ['https://plantpal.example'],
    traceId: () => 'trace-1',
  });
  return { app, status };
}

describe('environment routes', () => {
  it('returns schema-valid forecast facts with provenance', async () => {
    const { app } = make();
    const res = await app.request('/api/v1/env/forecast?lat=18.52&lon=73.86');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=600');
    expect(res.headers.get('ratelimit-limit')).toBe('100');
    const body = Forecast.parse(await res.json());
    expect(body.provenance).toMatchObject({
      provider: 'open-meteo-forecast',
      demo: true,
      lat: 18.5,
      lon: 73.85,
    });
  });

  it('serves places, air, elevation and solar climatology', async () => {
    const { app } = make();
    const places = PlaceSearch.parse(await (await app.request('/api/v1/env/places?q=Pune&lang=en')).json());
    expect(places.results[0]?.name).toBe('Pune');
    for (const path of ['air', 'elevation', 'solar']) {
      expect((await app.request(`/api/v1/env/${path}?lat=-33.87&lon=151.21`)).status).toBe(200);
    }
  });

  it('rejects invalid input with RFC 9457 problem details', async () => {
    const { app } = make();
    const res = await app.request('/api/v1/env/forecast?lat=123&lon=0');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const p = Problem.parse(await res.json());
    expect(p).toMatchObject({ code: 'VALIDATION_FAILED', traceId: 'trace-1' });
    expect(p.detail).toContain('lat');
  });

  it('rate-limits per client with Retry-After', async () => {
    const { app } = make({ capacity: 2 });
    const headers = { 'cf-connecting-ip': '203.0.113.9' };
    await app.request('/api/v1/env/elevation?lat=1&lon=1', { headers });
    await app.request('/api/v1/env/elevation?lat=1&lon=1', { headers });
    const res = await app.request('/api/v1/env/elevation?lat=1&lon=1', { headers });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('1');
    expect(((await res.json()) as Problem).code).toBe('RATE_LIMITED');
    expect(
      (
        await app.request('/api/v1/env/elevation?lat=1&lon=1', {
          headers: { 'cf-connecting-ip': '198.51.100.1' },
        })
      ).status,
    ).toBe(200);
  });

  it('turns provider outages into 503 PROVIDER_UNAVAILABLE and records status', async () => {
    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 502 }));
    const { app, status } = make({ mode: 'live', fetch: failing });
    const res = await app.request('/api/v1/env/air?lat=1&lon=1');
    expect(res.status).toBe(503);
    expect(((await res.json()) as Problem).code).toBe('PROVIDER_UNAVAILABLE');
    expect((await status.list())[0]).toMatchObject({
      provider: 'open-meteo-air',
      lastErrorCode: 'HTTP',
      consecutiveFailures: 1,
    });
    const st = (await (await app.request('/api/v1/status')).json()) as {
      ok: boolean;
      providers: Array<{ provider: string }>;
    };
    expect(st.ok).toBe(true);
    expect(st.providers.find((p) => p.provider === 'open-meteo-air')).toMatchObject({
      lastErrorCode: 'HTTP',
    });
  });

  it('keeps /status working when the status store is down', async () => {
    const broken = new MemoryStatusStore();
    broken.list = async () => {
      throw new Error('D1 down');
    };
    const { app } = make({ status: broken });
    const res = await app.request('/api/v1/status');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { providers: unknown[] }).providers).toHaveLength(8);
  });

  it('publishes an OpenAPI 3.1 document', async () => {
    const { app } = make();
    const doc = (await (await app.request('/api/v1/openapi.json')).json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining(['/api/v1/env/forecast', '/api/v1/env/places', '/api/v1/status']),
    );
  });

  it('allows only configured origins and answers unknown paths with a problem', async () => {
    const { app } = make();
    const ok = await app.request('/api/v1/status', { headers: { Origin: 'https://plantpal.example' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://plantpal.example');
    const no = await app.request('/api/v1/status', { headers: { Origin: 'https://evil.example' } });
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
    const nf = await app.request('/api/v1/nope');
    expect(nf.status).toBe(404);
    expect(((await nf.json()) as Problem).code).toBe('NOT_FOUND');
  });
});

describe('D1 provider status store', () => {
  it('applies the migration and upserts health records', async () => {
    const d1 = createD1();
    await d1.exec(
      readFileSync(new URL('../migrations/0001_provider_status.sql', import.meta.url).pathname, 'utf8'),
    );
    const store = new D1StatusStore(d1);
    await store.record({ provider: 'gbif', ok: false, at: 1000, latencyMs: null, code: 'TIMEOUT' });
    await store.record({ provider: 'gbif', ok: false, at: 2000, latencyMs: null, code: 'HTTP' });
    expect((await store.list())[0]).toMatchObject({
      provider: 'gbif',
      consecutiveFailures: 2,
      lastErrorCode: 'HTTP',
      enabled: true,
    });
    await store.record({ provider: 'gbif', ok: true, at: 3000, latencyMs: 120, code: null });
    expect((await store.list())[0]).toMatchObject({
      consecutiveFailures: 0,
      lastLatencyMs: 120,
      lastSuccessAt: new Date(3000).toISOString(),
    });
    await d1.exec("UPDATE provider_status SET enabled = 0 WHERE provider = 'gbif'");
    expect(await store.disabled()).toEqual(['gbif']);
  });
});
