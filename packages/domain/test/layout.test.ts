import type { LayoutBody, LayoutItem } from '@plantpal/schemas';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  circleOverlapArea,
  convexHull,
  estimateLoad,
  findConflicts,
  footprint,
  fromLayoutExport,
  isSimplePolygon,
  LayoutImportError,
  hoursAt,
  itemShadow,
  itemVolumeL,
  layoutSvg,
  pointInPolygon,
  polygonArea,
  polygonInside,
  polygonsOverlap,
  shadowDirection,
  sizeAtStage,
  snap,
  sunHoursGrid,
  toLayoutExport,
  type PlantFacts,
  type Vec,
} from '../src/layout';

const item = (over: Partial<LayoutItem> & Pick<LayoutItem, 'id' | 'kind'>): LayoutItem => ({
  label: over.id,
  shape: 'rect',
  x: 0,
  y: 0,
  x2: 0,
  y2: 0,
  lengthM: 0,
  widthM: 0,
  diameterM: 0,
  rotationDeg: 0,
  heightM: null,
  depthM: null,
  volumeL: null,
  solid: false,
  specimenId: null,
  taxonId: null,
  containerId: null,
  inId: null,
  note: '',
  ...over,
});

const body = (
  items: LayoutItem[],
  outline: Array<[number, number]> = [
    [0, 0],
    [4, 0],
    [4, 2],
    [0, 2],
  ],
  rotationDeg = 0,
): LayoutBody => ({
  name: 'Balcony',
  frame: { frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg },
  outline,
  items,
});

describe('geometry', () => {
  const sq = (x: number, y: number, s: number): Vec[] => [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s],
  ];
  it('overlap and containment, including a concave L-shaped outline', () => {
    expect(polygonsOverlap(sq(0, 0, 1), sq(0.5, 0.5, 1))).toBe(true);
    expect(polygonsOverlap(sq(0, 0, 1), sq(1, 0, 1))).toBe(false); // touching edges only
    expect(polygonsOverlap(sq(0, 0, 1), sq(0, 0, 1))).toBe(true);
    expect(polygonsOverlap(sq(0, 0, 3), sq(1, 1, 0.5))).toBe(true); // one inside the other
    const L: Vec[] = [
      [0, 0],
      [3, 0],
      [3, 1],
      [1, 1],
      [1, 3],
      [0, 3],
    ];
    expect(polygonInside(sq(0.2, 0.2, 0.5), L)).toBe(true);
    expect(polygonInside(sq(1.5, 1.5, 0.5), L)).toBe(false); // in the notch
    expect(polygonInside(sq(0.5, 0.5, 1), L)).toBe(false); // crosses the inner corner
    expect(polygonArea(L)).toBe(5);
    expect(pointInPolygon([1, 1], L)).toBe(true); // on the boundary
  });

  it('rotated rectangles and circles', () => {
    const r = footprint(item({ id: 'b', kind: 'bed', x: 1, y: 1, lengthM: 2, widthM: 1, rotationDeg: 90 }));
    const xs = r.map((p) => Math.round(p[0] * 1000) / 1000);
    expect(Math.min(...xs)).toBe(0.5);
    expect(Math.max(...xs)).toBe(1.5);
    expect(
      polygonArea(footprint(item({ id: 'p', kind: 'container', shape: 'round', diameterM: 1 }), 256)),
    ).toBeCloseTo(Math.PI / 4, 3);
  });

  it('circle overlap area: apart, contained and the lens', () => {
    expect(circleOverlapArea(1, 1, 3)).toBe(0);
    expect(circleOverlapArea(1, 0.5, 0.2)).toBeCloseTo(Math.PI * 0.25, 9);
    expect(circleOverlapArea(1, 1, 1)).toBeCloseTo(1.2284, 3);
  });

  it('convex hull contains every point (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.double({ min: -5, max: 5, noNaN: true }), fc.double({ min: -5, max: 5, noNaN: true })),
          { minLength: 3, maxLength: 30 },
        ),
        (pts) => {
          const hull = convexHull(pts as Vec[]);
          if (hull.length < 3) return;
          for (const p of pts) expect(pointInPolygon(p as Vec, hull)).toBe(true);
        },
      ),
    );
  });

  it('snaps to 10 cm without float noise', () => {
    expect(snap(0.3333)).toBe(0.3);
    expect(snap(1.26, 0.01)).toBe(1.26);
  });
});

const facts: Record<string, PlantFacts> = {
  tomato: {
    name: 'Tomato',
    spreadCm: { min: 40, max: 60 },
    heightCm: { min: 120, max: 180 },
    minContainerL: 20,
    sunHours: { min: 6, max: 10 },
  },
  basil: {
    name: 'Basil',
    spreadCm: { min: 20, max: 30 },
    heightCm: { min: 30, max: 50 },
    minContainerL: 3,
    sunHours: { min: 4, max: 8 },
  },
};

describe('conflicts', () => {
  const pot = item({
    id: 'pot',
    kind: 'container',
    shape: 'round',
    x: 1,
    y: 1,
    diameterM: 0.3,
    depthM: 0.25,
    label: 'Pot',
  });
  const tom = item({
    id: 't1',
    kind: 'plant',
    shape: 'round',
    x: 1,
    y: 1,
    taxonId: 'tomato',
    inId: 'pot',
    label: 'Tomato',
  });
  const ctx = (hours: number | null = 7, clearanceM: number | null = null) => ({
    facts: (i: LayoutItem) => (i.taxonId ? (facts[i.taxonId] ?? null) : null),
    sunHoursAt: () => hours,
    clearanceM,
  });

  it('container volume from dimensions; too small for the plant', () => {
    expect(itemVolumeL(pot)).toBe(18);
    expect(itemVolumeL({ ...pot, depthM: null })).toBeNull();
    const c = findConflicts(body([pot, tom]), ctx());
    expect(c.map((x) => x.kind)).toEqual(['container-small']);
    expect(c[0]?.params).toMatchObject({ volumeL: 18, minL: 20 });
  });

  it('light, height, path width, outside the outline and plant not in its container', () => {
    const path = item({ id: 'path', kind: 'path', x: 2, y: 1.5, lengthM: 1, widthM: 0.5 });
    const out = item({ id: 'tank', kind: 'tank', shape: 'round', x: 3.9, y: 1, diameterM: 0.6 });
    const stray = { ...tom, id: 't2', x: 2.5, y: 0.5 };
    const kinds = findConflicts(body([pot, path, out, stray]), ctx(3, 1.2))
      .map((x) => x.kind)
      .sort();
    expect(kinds).toEqual([
      'container-small',
      'height',
      'light',
      'not-in-container',
      'outside',
      'path-narrow',
    ]);
  });

  it('spacing: mature spreads overlapping by more than a fifth of the smaller', () => {
    const a = item({ id: 'a', kind: 'plant', shape: 'round', x: 1, y: 1, taxonId: 'tomato' });
    const b = item({ id: 'b', kind: 'plant', shape: 'round', x: 1.3, y: 1, taxonId: 'basil' });
    const far = item({ id: 'c', kind: 'plant', shape: 'round', x: 3, y: 1, taxonId: 'basil' });
    const c = findConflicts(body([a, b, far]), ctx());
    expect(c.filter((x) => x.kind === 'spacing').map((x) => x.itemIds)).toEqual([['a', 'b']]);
  });

  it('saturated load lists its basis and what it could not count', () => {
    const tank = item({ id: 'tank', kind: 'tank', shape: 'round', x: 3, y: 1, diameterM: 0.5, volumeL: 200 });
    const unknown = item({
      id: 'u',
      kind: 'container',
      x: 2,
      y: 1,
      lengthM: 0.4,
      widthM: 0.4,
      label: 'Mystery pot',
    });
    const l = estimateLoad(body([pot, tank, unknown]));
    expect(l.lines.map((x) => x.kg)).toEqual([24, 220]);
    expect(l.totalKg).toBe(244);
    expect(l.areaM2).toBe(8);
    expect(l.kgPerM2).toBe(31);
    expect(l.unknown).toEqual(['Mystery pot']);
  });
});

describe('sun and shade', () => {
  it('shadows fall away from the sun, rotated with the frame', () => {
    const [x, y] = shadowDirection(180, 0); // noon sun in the south, plan up = north
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(-1, 9);
    const [x2, y2] = shadowDirection(180, 90); // plan up = east → north is to the left
    expect(x2).toBeCloseTo(-1, 9);
    expect(y2).toBeCloseTo(0, 9);
  });

  it('a 2 m wall at 45° sun casts a 2 m deep shadow; an overhang slab shifts by its height', () => {
    const wall = item({
      id: 'w',
      kind: 'wall',
      shape: 'line',
      x: 0,
      y: 2,
      x2: 4,
      y2: 2,
      heightM: 2,
      solid: true,
    });
    const s = itemShadow(wall, [0, -1], 45)!;
    expect(Math.min(...s.map((p) => p[1]))).toBeCloseTo(0, 6);
    expect(polygonArea(s)).toBeCloseTo(8, 6);
    const slab = item({
      id: 'o',
      kind: 'overhang',
      x: 2,
      y: 0.25,
      lengthM: 4,
      widthM: 0.5,
      heightM: 2.5,
      solid: true,
    });
    const so = itemShadow(slab, [0, 1], 45)!;
    expect(Math.min(...so.map((p) => p[1]))).toBeCloseTo(2.5, 6);
    expect(itemShadow({ ...wall, solid: false }, [0, -1], 45)).toBeNull();
    expect(itemShadow(wall, [0, -1], -1)).toBeNull();
  });

  it('a tall south wall leaves the strip behind it in shade at midwinter noon (Pune)', () => {
    // Outline 4 m × 3 m; plan up = north; a 3 m wall along the south edge (y = 3).
    const wall = item({
      id: 'w',
      kind: 'wall',
      shape: 'line',
      x: 0,
      y: 3,
      x2: 4,
      y2: 3,
      heightM: 3,
      solid: true,
    });
    const b = body(
      [wall],
      [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ],
    );
    const opts = {
      lat: 18.52,
      lon: 73.86,
      timeZone: 'Asia/Kolkata',
      date: '2026-12-21',
      horizon: null,
      cellM: 0.5,
      stepMin: 15,
    };
    const g = sunHoursGrid(b, opts);
    const open = sunHoursGrid(
      body(
        [],
        [
          [0, 0],
          [4, 0],
          [4, 3],
          [0, 3],
        ],
      ),
      opts,
    );
    const nearWall = hoursAt(g, 2, 2.75)!;
    const farSide = hoursAt(g, 2, 0.25)!;
    expect(hoursAt(open, 2, 2.75)!).toBeGreaterThan(10);
    expect(nearWall).toBeLessThan(2);
    expect(farSide).toBeGreaterThan(nearWall);
    expect(hoursAt(g, 10, 10)).toBeNull();
  });

  it('cells outside an L-shaped outline are not counted', () => {
    const g = sunHoursGrid(
      body(
        [],
        [
          [0, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 2],
          [0, 2],
        ],
      ),
      {
        lat: 51.5,
        lon: -0.1,
        timeZone: 'Europe/London',
        date: '2026-06-21',
        horizon: null,
        cellM: 0.5,
        stepMin: 30,
      },
    );
    expect(hoursAt(g, 1.5, 1.5)).toBeNull();
    expect(hoursAt(g, 0.5, 0.5)!).toBeGreaterThan(15);
  });
});

describe('growth scenarios', () => {
  it('uses the catalogue range with a band; annuals reset each season', () => {
    expect(sizeAtStage({ min: 40, max: 60 }, 'shrub', '1y')).toEqual({
      min: 14,
      max: 21,
      mid: 17.5,
      resets: false,
    });
    expect(sizeAtStage({ min: 40, max: 60 }, 'annual', '3y')).toMatchObject({
      min: 40,
      max: 60,
      resets: true,
    });
    expect(sizeAtStage(null, 'annual', 'mature')).toBeNull();
  });
});

describe('export', () => {
  it('JSON round-trips in the named local frame; GeoJSON is refused (Appendix B)', () => {
    const b = body(
      [
        item({
          id: 'p',
          kind: 'container',
          shape: 'round',
          x: 2,
          y: 3,
          diameterM: 0.3,
          depthM: 0.3,
          label: 'Pot <1>',
        }),
      ],
      undefined,
      30,
    );
    const json = JSON.parse(JSON.stringify(toLayoutExport(b)));
    expect(json.frame).toEqual({ frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: 30 });
    expect(json.type).toBe('plantpal-layout');
    expect(fromLayoutExport(json)).toEqual(b);
    expect(() => fromLayoutExport({ type: 'FeatureCollection', features: [] })).toThrow(/GeoJSON/);
    expect(() => fromLayoutExport({ hello: 1 })).toThrow(/not a PlantPal layout/);
    try {
      fromLayoutExport({ type: 'Feature' });
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutImportError);
      expect((e as LayoutImportError).code).toBe('geojson');
    }
  });

  it('SVG is to scale, escapes labels and has a legend', () => {
    const svg = layoutSvg(
      body([
        item({
          id: 'p',
          kind: 'container',
          x: 1,
          y: 1,
          lengthM: 0.5,
          widthM: 0.5,
          label: 'Herbs & <greens>',
        }),
      ]),
      { title: 'My "balcony"' },
    );
    expect(svg).toContain('Herbs &amp; &lt;greens&gt;');
    expect(svg).toContain('<title>My &quot;balcony&quot;</title>');
    expect(svg).toContain('>1 m<');
    expect(svg).toContain('metres, local frame');
    expect(svg).not.toMatch(/<script/i);
  });
});

describe('outline', () => {
  it('accepts rectangles and L-shapes, refuses bow-ties and flat outlines', () => {
    expect(
      isSimplePolygon([
        [0, 0],
        [3, 0],
        [3, 1.5],
        [0, 1.5],
      ]),
    ).toBe(true);
    expect(
      isSimplePolygon([
        [0, 0],
        [3, 0],
        [3, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ]),
    ).toBe(true);
    expect(
      isSimplePolygon([
        [0, 0],
        [3, 1.5],
        [3, 0],
        [0, 1.5],
      ]),
    ).toBe(false);
    expect(
      isSimplePolygon([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toBe(false);
  });
});
