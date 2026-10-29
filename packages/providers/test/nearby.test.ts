import { describe, expect, it, vi } from 'vitest';
import {
  EnvClient,
  fixtures,
  MemoryCache,
  nearbyUrl,
  OPEN_LICENCES,
  parseSpeciesCounts,
  speciesCountsUrl,
} from '../src';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const live = (f: typeof fetch) =>
  new EnvClient({
    mode: 'live',
    cache: new MemoryCache(),
    fetch: f,
    now: () => Date.parse('2026-10-29T09:00:00Z'),
    sleep: async () => {},
  });

describe('neighbourhood nature (§6.10, S8)', () => {
  it('GBIF asks a true radius and only CC0 and CC BY records', () => {
    const u = new URL(nearbyUrl(18.52, 73.86, 3, 'animals'));
    expect(u.searchParams.get('geoDistance')).toBe('18.52,73.86,3km');
    expect(u.searchParams.getAll('license')).toEqual([...OPEN_LICENCES]);
    expect(u.searchParams.getAll('license').some((l) => /NC/.test(l))).toBe(false);
    expect(u.searchParams.get('occurrenceStatus')).toBe('PRESENT');
  });

  it('iNaturalist asks research-grade, verifiable observations of one iconic group', () => {
    const u = new URL(speciesCountsUrl(18.5, 73.85, 2, 'insects'));
    expect(u.origin + u.pathname).toBe('https://api.inaturalist.org/v1/observations/species_counts');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      lat: '18.5',
      lng: '73.85',
      radius: '2',
      iconic_taxa: 'Insecta',
      quality_grade: 'research',
      verifiable: 'true',
    });
  });

  it('keeps species-level rows only', () => {
    const p = parseSpeciesCounts(fixtures.inatSpeciesCountsFixture('insects'), {
      group: 'insects',
      radiusKm: 2,
      provenance: {} as never,
    });
    expect(p.species.map((s) => s.name)).not.toContain('Apidae');
    expect(p.species[0]).toEqual({
      taxonId: 1,
      name: 'Apis cerana',
      commonName: 'Asian honey bee',
      observations: 41,
    });
    expect(() =>
      parseSpeciesCounts({ nope: 1 }, { group: 'birds', radiusKm: 1, provenance: {} as never }),
    ).toThrow();
  });

  it('rounds the location to about 5 km and clamps the radius to 1–5 km before anything is sent', async () => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      return ok(
        u.includes('inaturalist')
          ? fixtures.inatSpeciesCountsFixture('birds')
          : fixtures.gbifNearbyFixtureFor('plants'),
      );
    }) as unknown as typeof fetch;
    const c = live(f);
    const birds = await c.nearbySpecies(18.52041, 73.85674, 12, 'birds');
    const sent = new URL(String((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]));
    expect(sent.searchParams.get('lat')).toBe('18.5');
    expect(sent.searchParams.get('lng')).toBe('73.85');
    expect(sent.searchParams.get('radius')).toBe('5');
    expect(birds.radiusKm).toBe(5);
    expect(birds.provenance).toMatchObject({ provider: 'inaturalist', lat: 18.5, lon: 73.85, demo: false });

    const plants = await c.nearbyRecords(18.52041, 73.85674, 0.2, 'plants');
    expect(plants).toMatchObject({ radiusKm: 1, records: 1240, taxa: 140, taxaCapped: false });
    expect(plants.licences).toEqual(['CC0_1_0', 'CC_BY_4_0']);
  });

  it('demo mode serves labelled fixtures without the network', async () => {
    const f = vi.fn() as unknown as typeof fetch;
    const c = new EnvClient({ mode: 'mock', cache: new MemoryCache(), fetch: f });
    const r = await c.nearbySpecies(51.5, -0.12, 2, 'plants');
    expect(r.provenance.demo).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});
