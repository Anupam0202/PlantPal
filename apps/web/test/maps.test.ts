import { latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import {
  greenShares,
  hexFeatures,
  inRing,
  metresBetween,
  metresToArea,
  nearestAreas,
  type LonLat,
} from '../src/features/maps/geo';

const square = (cx: number, cy: number, half: number): LonLat[] => [
  [cx - half, cy - half],
  [cx + half, cy - half],
  [cx + half, cy + half],
  [cx - half, cy + half],
  [cx - half, cy - half],
];
const area = (id: string, ring: LonLat[], kind: 'park' | 'wood' = 'park') => ({
  id,
  kind,
  name: null,
  rings: [ring],
});

describe('map geometry on the device', () => {
  it('tests points inside and outside rings', () => {
    const r = square(0, 0, 1);
    expect(inRing([0, 0], r)).toBe(true);
    expect(inRing([2, 0], r)).toBe(false);
  });

  it('measures distances in metres', () => {
    // 0.01° of latitude is about 1.1 km anywhere.
    expect(metresBetween([73.86, 18.52], [73.86, 18.53])).toBeCloseTo(1113, -1);
    const park = area('p', square(73.87, 18.52, 0.001));
    expect(metresToArea([73.87, 18.52], park)).toBe(0);
    // 0.009° of longitude east of the park's west edge at 18.5° N: about 950 m.
    const d = metresToArea([73.86, 18.52], park);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1000);
  });

  it('orders nearby areas by distance', () => {
    const near = area('near', square(73.861, 18.52, 0.0005));
    const far = area('far', square(73.9, 18.52, 0.0005), 'wood');
    expect(nearestAreas([73.86, 18.52], [far, near]).map((n) => n.area.id)).toEqual(['near', 'far']);
  });

  it('estimates the green share of each small hexagon in a tile', async () => {
    const tile = latLngToCell(18.52, 73.86, 7);
    const none = await greenShares(tile, []);
    expect(none).toHaveLength(49);
    expect(none.every((h) => h.value === 0)).toBe(true);
    // An area that covers the whole tile makes every hexagon fully green.
    const all = await greenShares(tile, [area('big', square(73.86, 18.52, 0.1))]);
    expect(all.every((h) => h.value === 1)).toBe(true);
  });

  it('builds GeoJSON hexagons in [lon, lat] order', async () => {
    const cell = latLngToCell(18.52, 73.86, 7);
    const fc = await hexFeatures([{ cell, value: 3 }]);
    const ring = fc.features[0]!.geometry.coordinates[0]!;
    expect(ring[0]![0]).toBeGreaterThan(70);
    expect(ring[0]![1]).toBeLessThan(20);
    expect(fc.features[0]!.properties).toEqual({ cell, value: 3 });
  });
});
