import { describe, expect, it, vi } from 'vitest';
import { EnvClient, fixtures, MemoryCache, type StatusEvent } from '../src';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function setup(fetchImpl: typeof fetch) {
  let t = Date.parse('2026-10-28T09:00:00Z');
  const events: StatusEvent[] = [];
  const cache = new MemoryCache();
  const client = new EnvClient({
    mode: 'live',
    cache,
    fetch: fetchImpl,
    now: () => t,
    onStatus: (e) => events.push(e),
    sleep: async () => {},
  });
  return { client, events, cache, advance: (ms: number) => (t += ms) };
}

describe('EnvClient', () => {
  it('sends rounded coordinates and caches fresh results', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok(fixtures.elevationFixture(559)));
    const { client } = setup(f);
    await client.elevation(18.52043, 73.85674);
    await client.elevation(18.52043, 73.85674);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toContain('latitude=18.52&longitude=73.86');
  });

  it('coalesces concurrent identical requests', async () => {
    const f = vi.fn<typeof fetch>().mockImplementation(async () => ok(fixtures.airFixture()));
    const { client } = setup(f);
    await Promise.all([client.air(18.5, 73.85), client.air(18.5, 73.85), client.air(18.51, 73.86)]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('L07: never caches failures and retries the source next time', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(ok(fixtures.airFixture()));
    const { client, events } = setup(f);
    await expect(client.air(18.5, 73.85)).rejects.toMatchObject({ code: 'HTTP' });
    await expect(client.air(18.5, 73.85)).resolves.toMatchObject({ usAqi: { value: 87 } });
    expect(events.map((e) => e.ok)).toEqual([false, true]);
  });

  it('L07: serves a stale copy, clearly marked, when the provider fails after the TTL', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok(fixtures.airFixture()))
      .mockResolvedValue(new Response('', { status: 503 }));
    const { client, advance } = setup(f);
    const fresh = await client.air(18.5, 73.85);
    expect(fresh.provenance.stale).toBe(false);
    advance(61 * 60_000);
    const stale = await client.air(18.5, 73.85);
    expect(stale.provenance.stale).toBe(true);
    expect(stale.usAqi.stale).toBe(true);
    advance(7 * 3600_000);
    await expect(client.air(18.5, 73.85)).rejects.toMatchObject({ code: 'HTTP' });
  });

  it('opens the circuit after repeated failures and fails fast', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 500 }));
    const { client } = setup(f);
    for (let i = 0; i < 4; i++) await expect(client.elevation(1 + i, 1)).rejects.toBeTruthy();
    const calls = f.mock.calls.length;
    await expect(client.elevation(9, 9)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(f.mock.calls.length).toBe(calls);
    expect(client.status().find((s) => s.provider === 'open-meteo-elevation')).toMatchObject({
      circuit: 'open',
      consecutiveFailures: 4,
    });
  });

  it('honours kill switches', async () => {
    const f = vi.fn<typeof fetch>();
    const client = new EnvClient({
      mode: 'live',
      cache: new MemoryCache(),
      fetch: f,
      disabled: ['nasa-power'],
    });
    await expect(client.solarClimatology(1, 1)).rejects.toMatchObject({ code: 'DISABLED' });
    expect(f).not.toHaveBeenCalled();
  });

  it('serves labelled demo data in mock mode without any network', async () => {
    const f = vi.fn<typeof fetch>();
    const client = new EnvClient({ mode: 'mock', cache: new MemoryCache(), fetch: f });
    const fc = await client.forecast(18.5, 73.85);
    expect(fc.provenance.demo).toBe(true);
    expect(fc.current.soilMoisture3to9cm.value).toBe(0.21);
    expect((await client.searchPlaces('Pune', 'en')).results[0]?.name).toBe('Pune');
    expect(f).not.toHaveBeenCalled();
  });

  it('builds a climate profile from the last ten complete years of reanalysis', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        ok(fixtures.dailyFixture({ from: 2015, to: 2025, mean: 10, amplitude: 9 })),
      );
    const { client } = setup(f);
    const p = await client.climateProfile(51.5072, -0.1276);
    const url = new URL(String(f.mock.calls[0]?.[0]));
    expect(url.searchParams.get('start_date')).toBe('2015-01-01');
    expect(url.searchParams.get('end_date')).toBe('2025-12-31');
    expect(url.searchParams.get('latitude')).toBe('51.5');
    expect(p.period).toBe('2016–2025');
    // Coldest night: 10 − 9 − 5 = −4 °C every year → −4 °C mean extreme minimum, zone 9a.
    expect(p.extremeMinC).toBe(-4);
    expect(p.hardinessZone).toBe('9a');
    expect(p.frost?.frostSeasonsPct).toBe(100);
    expect(p.seasonDays).toBeGreaterThan(150);
    expect(p.seasonDays).toBeLessThan(330);
    expect(p.hotSummers).toBe(false);
    expect(p.months).toHaveLength(12);
    expect(p.provenance).toMatchObject({ provider: 'open-meteo-historical', demo: false, model: 'ERA5' });
  });

  it('demo climate profile is labelled as demo', async () => {
    const client = new EnvClient({
      mode: 'mock',
      cache: new MemoryCache(),
      now: () => Date.parse('2026-10-28T09:00:00Z'),
    });
    const p = await client.climateProfile(18.52, 73.86);
    expect(p.provenance.demo).toBe(true);
    expect(p.seasonDays).toBe(365);
    expect(p.hardinessZone).not.toBeNull();
  });
});
