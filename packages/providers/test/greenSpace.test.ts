import { GreenSpace } from '@plantpal/schemas';
import { describe, expect, it, vi } from 'vitest';
import {
  EnvClient,
  fixtures,
  greenKind,
  greenSpaceQuery,
  MemoryCache,
  parseGreenSpace,
  stitchRings,
  type Bbox,
} from '../src';
import { provenance } from '../src/core/provenance';

const BBOX: Bbox = [73.85, 18.51, 73.87, 18.53];
const prov = provenance('overpass', { retrievedAt: '2026-10-30T00:00:00Z', lat: null, lon: null });

describe('green space from OpenStreetMap (§6.16)', () => {
  it('asks Overpass for green land cover inside the tile box only', () => {
    const q = greenSpaceQuery(BBOX);
    expect(q).toContain('(18.5100,73.8500,18.5300,73.8700)');
    expect(q).toMatch(/leisure.*park/);
    expect(q).toMatch(/roof:material/);
    expect(q).toContain('out geom');
  });

  it('classifies tags and ignores what is not green space', () => {
    expect(greenKind({ leisure: 'park' })).toBe('park');
    expect(greenKind({ natural: 'wood' })).toBe('wood');
    expect(greenKind({ landuse: 'allotments' })).toBe('allotment');
    expect(greenKind({ amenity: 'grave_yard' })).toBe('cemetery');
    expect(greenKind({ building: 'yes', 'roof:material': 'grass' })).toBe('green-roof');
    expect(greenKind({ building: 'yes' })).toBeNull();
    expect(greenKind({ landuse: 'residential' })).toBeNull();
  });

  it('stitches open multipolygon ways into closed rings, in either direction', () => {
    const a: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const b: Array<[number, number]> = [
      [0, 0],
      [0, 1],
      [1, 1],
    ];
    const rings = stitchRings([a, b]);
    expect(rings).toHaveLength(1);
    expect(rings[0]![0]).toEqual(rings[0]!.at(-1));
    // A piece that never closes is dropped rather than drawn wrong.
    expect(stitchRings([a])).toEqual([]);
  });

  it('parses the fixture into valid areas, largest first, and drops non-green features', () => {
    const g = parseGreenSpace(fixtures.overpassGreenFixture(BBOX), {
      tile: 't',
      bbox: BBOX,
      provenance: prov,
    });
    expect(GreenSpace.safeParse(g).success).toBe(true);
    expect(g.areas.map((a) => a.kind).sort()).toEqual(['cemetery', 'park', 'wood']);
    expect(g.areas[0]!.kind).toBe('wood');
    expect(g.areas.find((a) => a.kind === 'park')?.name).toBe('Riverside Park');
    expect(g.truncated).toBe(false);
    expect(g.provenance.attribution).toBe('© OpenStreetMap contributors');
  });

  it('keeps responses small: at most 300 areas', () => {
    const square = (i: number) => ({
      type: 'way',
      id: i,
      tags: { leisure: 'garden' },
      geometry: [
        { lat: 0, lon: i },
        { lat: 0, lon: i + 0.5 },
        { lat: 0.5, lon: i + 0.5 },
        { lat: 0, lon: i },
      ],
    });
    const g = parseGreenSpace(
      { elements: Array.from({ length: 320 }, (_, i) => square(i)) },
      { tile: 't', bbox: BBOX, provenance: prov },
    );
    expect(g.areas).toHaveLength(300);
    expect(g.truncated).toBe(true);
  });

  it('rejects a response that is not Overpass JSON', () => {
    expect(() => parseGreenSpace({ nope: true }, { tile: 't', bbox: BBOX, provenance: prov })).toThrow();
  });

  it('caches per tile, so one Overpass query serves everyone in it', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(fixtures.overpassGreenFixture(BBOX))));
    const client = new EnvClient({ mode: 'live', cache: new MemoryCache(), fetch: f, sleep: async () => {} });
    const a = await client.greenSpace('872a1072bffffff', BBOX);
    const b = await client.greenSpace('872a1072bffffff', BBOX);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]?.[0])).toContain('overpass-api.de/api/interpreter?data=');
    expect(a).toEqual(b);
    expect(a.provenance.demo).toBe(false);
  });
});
