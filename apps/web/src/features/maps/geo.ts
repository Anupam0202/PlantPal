import type { GreenSpace } from '@plantpal/schemas';

/**
 * Map geometry that runs on the device (loaded with h3-js on map pages only). Precise garden
 * coordinates are used here and never sent anywhere.
 */

export type LonLat = [number, number];
type Ring = LonLat[];
type Area = GreenSpace['areas'][number];

export interface HexFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { cell: string; value: number };
    geometry: { type: 'Polygon'; coordinates: LonLat[][] };
  }>;
}

async function h3() {
  return import('h3-js');
}

/** GeoJSON hexagons for cells, each carrying a value for colouring. */
export async function hexFeatures(
  cells: Array<{ cell: string; value: number }>,
): Promise<HexFeatureCollection> {
  const { cellToBoundary } = await h3();
  return {
    type: 'FeatureCollection',
    features: cells.map(({ cell, value }) => ({
      type: 'Feature',
      properties: { cell, value },
      geometry: { type: 'Polygon', coordinates: [cellToBoundary(cell, true) as LonLat[]] },
    })),
  };
}

export async function cellCenter(cell: string): Promise<LonLat> {
  const { cellToLatLng } = await h3();
  const [lat, lon] = cellToLatLng(cell);
  return [lon, lat];
}

/** Ray casting; points on an edge may fall either way, which is fine for shares. */
export function inRing([x, y]: LonLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const inArea = (p: LonLat, a: Pick<Area, 'rings'>) => a.rings.some((r) => inRing(p, r));

const M_PER_DEG = 111_320;

/** Metres between two points (equirectangular; accurate to well under 1% at these distances). */
export function metresBetween(a: LonLat, b: LonLat): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * M_PER_DEG;
}

function metresToSegment(p: LonLat, a: LonLat, b: LonLat): number {
  const k = Math.cos((p[1] * Math.PI) / 180);
  const [px, py, ax, ay, bx, by] = [p[0] * k, p[1], a[0] * k, a[1], b[0] * k, b[1]];
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * M_PER_DEG;
}

/** Distance from a point to an area: 0 inside it, else to its nearest edge. */
export function metresToArea(p: LonLat, a: Pick<Area, 'rings'>): number {
  if (inArea(p, a)) return 0;
  let best = Infinity;
  for (const r of a.rings)
    for (let i = 1; i < r.length; i++) best = Math.min(best, metresToSegment(p, r[i - 1]!, r[i]!));
  return best;
}

/** The nearest mapped green areas to a point, closest first. */
export function nearestAreas(p: LonLat, areas: Area[], limit = 8): Array<{ area: Area; metres: number }> {
  return areas
    .map((area) => ({ area, metres: metresToArea(p, area) }))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, limit);
}

/**
 * Share of mapped green space in each resolution-9 hexagon (about 0.1 km²) of a resolution-7 tile,
 * from 13 sample points per hexagon: an estimate, shown as such.
 */
export async function greenShares(
  tile: string,
  areas: Area[],
): Promise<Array<{ cell: string; value: number }>> {
  const { cellToChildren, cellToBoundary, cellToLatLng } = await h3();
  return cellToChildren(tile, 9).map((cell) => {
    const [lat, lon] = cellToLatLng(cell);
    const c: LonLat = [lon, lat];
    const corners = cellToBoundary(cell, true) as LonLat[];
    const samples: LonLat[] = [c];
    for (const v of corners.slice(0, 6))
      for (const f of [0.45, 0.85]) samples.push([c[0] + (v[0] - c[0]) * f, c[1] + (v[1] - c[1]) * f]);
    const hits = samples.filter((s) => areas.some((a) => inArea(s, a))).length;
    return { cell, value: Math.round((hits / samples.length) * 100) / 100 };
  });
}
