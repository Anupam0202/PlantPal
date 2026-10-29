import { describe, expect, it, vi } from 'vitest';
import {
  EnvClient,
  fixtures,
  isOpenLicence,
  MemoryCache,
  parseCommons,
  parseSpeciesMatch,
  plainText,
  speciesMatchUrl,
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

describe('GBIF species match', () => {
  it('asks the plant kingdom and accepts only species-rank exact or fuzzy matches', () => {
    expect(speciesMatchUrl('Ocimum basilicum')).toBe(
      'https://api.gbif.org/v1/species/match?name=Ocimum+basilicum&kingdom=Plantae&strict=false',
    );
    const ctx = { query: 'x', retrievedAt: '2026-10-29T00:00:00Z' };
    expect(parseSpeciesMatch(fixtures.speciesMatchFixture('Ocimum basilicum'), ctx)).toMatchObject({
      resolved: true,
      usageKey: 2927096,
      family: 'Lamiaceae',
    });
    expect(parseSpeciesMatch(fixtures.speciesMatchFixture('Blueberrius fakeus'), ctx)).toMatchObject({
      resolved: false,
      matchType: 'NONE',
      usageKey: null,
    });
    expect(
      parseSpeciesMatch(
        { usageKey: 1, rank: 'GENUS', matchType: 'HIGHERRANK', confidence: 99, kingdom: 'Plantae' },
        ctx,
      ).resolved,
    ).toBe(false);
    expect(
      parseSpeciesMatch(
        {
          usageKey: 5,
          acceptedUsageKey: 7,
          rank: 'SPECIES',
          status: 'SYNONYM',
          matchType: 'EXACT',
          confidence: 97,
          kingdom: 'Plantae',
        },
        ctx,
      ),
    ).toMatchObject({
      resolved: true,
      acceptedKey: 7,
    });
    expect(
      parseSpeciesMatch(
        { usageKey: 5, rank: 'SPECIES', matchType: 'FUZZY', confidence: 60, kingdom: 'Plantae' },
        ctx,
      ).resolved,
    ).toBe(false);
  });

  it('is cached per normalised name', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => ok(fixtures.speciesMatchFixture('Mentha spicata')));
    const c = live(f);
    await c.speciesMatch('Mentha spicata');
    await c.speciesMatch('  mentha   SPICATA ');
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('Wikimedia Commons', () => {
  it('keeps only openly licensed bitmaps from upload.wikimedia.org, with plain-text authors', () => {
    const m = parseCommons(fixtures.commonsFixture('Ocimum basilicum'), {
      retrievedAt: '2026-10-29T00:00:00Z',
    });
    expect(m.items).toHaveLength(1);
    expect(m.items[0]).toMatchObject({ licence: 'CC BY-SA 4.0', author: 'Example Botanist' });
    expect(m.provenance.provider).toBe('wikimedia-commons');
  });
  it('licence filter and HTML stripping', () => {
    expect(isOpenLicence('CC0')).toBe(true);
    expect(isOpenLicence('CC BY 4.0')).toBe(true);
    expect(isOpenLicence('Public domain')).toBe(true);
    expect(isOpenLicence('CC BY-NC-SA 3.0')).toBe(false);
    expect(isOpenLicence('All rights reserved')).toBe(false);
    expect(plainText('<script>x</script><b>A &amp; B</b> <')).toBe('x A & B');
    // Entities decode once: an escaped entity stays as written.
    expect(plainText('Tom &amp;quot;Fern&amp;quot; &#39;Lee&#039;')).toBe("Tom &quot;Fern&quot; 'Lee'");
  });
});

describe('Wikidata names', () => {
  it('finds the item by GBIF id, then reads labels; the scientific name is not a common name', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(ok(fixtures.wikidataSearchFixture(2927096)))
      .mockResolvedValueOnce(ok(fixtures.wikidataLabelsFixture('Q27096')));
    const names = await live(f).speciesNames(2927096, 'Ocimum basilicum');
    expect(String(f.mock.calls[0]?.[0])).toContain('haswbstatement%3AP846%3D2927096');
    expect(names).toMatchObject({
      wikidataId: 'Q27096',
      names: { en: ['basil', 'sweet basil'], hi: ['तुलसी'], es: ['albahaca'] },
    });
  });
  it('no item → empty names without a second request', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValueOnce(ok(fixtures.wikidataSearchFixture(1)));
    const names = await live(f).speciesNames(1, 'Unknown plant');
    expect(f).toHaveBeenCalledTimes(1);
    expect(names.names).toEqual({ en: [], hi: [], es: [] });
  });
});
