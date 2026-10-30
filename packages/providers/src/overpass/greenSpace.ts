import { z } from 'zod';
import type { GreenKind, GreenSpace, Provenance } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';

export const OVERPASS_INTERPRETER = 'https://overpass-api.de/api/interpreter';

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

const MAX_AREAS = 300;
const MAX_POINTS = 25_000;

/**
 * Green space tagged in OpenStreetMap: parks, woods, meadows, allotments, cemeteries, gardens and
 * green roofs where tagged. `out geom` returns coordinates inline so no second request is needed.
 */
export function greenSpaceQuery([w, s, e, n]: Bbox): string {
  const b = `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
  return [
    '[out:json][timeout:25][maxsize:33554432];',
    '(',
    `  nwr["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"](${b});`,
    `  nwr["landuse"~"^(forest|meadow|grass|village_green|allotments|cemetery|orchard)$"](${b});`,
    `  nwr["natural"~"^(wood|scrub|grassland|heath|wetland)$"](${b});`,
    `  nwr["amenity"="grave_yard"](${b});`,
    `  way["roof:material"~"^(grass|plants)$"](${b});`,
    ');',
    'out geom qt;',
  ].join('\n');
}

export function greenSpaceUrl(bbox: Bbox): string {
  return `${OVERPASS_INTERPRETER}?data=${encodeURIComponent(greenSpaceQuery(bbox))}`;
}

/** Which kind of green a set of OSM tags describes, or null. */
export function greenKind(tags: Record<string, string>): GreenKind | null {
  const roof = tags['roof:material'];
  if (roof === 'grass' || roof === 'plants') return 'green-roof';
  const { leisure, landuse, natural, amenity } = tags;
  if (leisure === 'park' || leisure === 'nature_reserve' || leisure === 'recreation_ground') return 'park';
  if (leisure === 'garden') return 'garden';
  if (landuse === 'forest' || natural === 'wood' || landuse === 'orchard') return 'wood';
  if (landuse === 'allotments') return 'allotment';
  if (landuse === 'cemetery' || amenity === 'grave_yard') return 'cemetery';
  if (
    landuse === 'meadow' ||
    landuse === 'grass' ||
    landuse === 'village_green' ||
    natural === 'scrub' ||
    natural === 'grassland' ||
    natural === 'heath' ||
    natural === 'wetland'
  )
    return 'meadow';
  return null;
}

const LatLon = z.object({ lat: z.number(), lon: z.number() });
const Element = z.object({
  type: z.enum(['node', 'way', 'relation']),
  id: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
  geometry: z.array(LatLon.nullable()).optional(),
  members: z
    .array(
      z.object({
        type: z.string(),
        role: z.string(),
        geometry: z.array(LatLon.nullable()).optional(),
      }),
    )
    .optional(),
});
const Raw = z.object({ elements: z.array(z.unknown()) });

type Pt = [number, number];
const round = (v: number) => Math.round(v * 1e5) / 1e5;
const toPts = (g: Array<{ lat: number; lon: number } | null> | undefined): Pt[] =>
  (g ?? [])
    .filter((p): p is { lat: number; lon: number } => p !== null)
    .map((p) => [round(p.lon), round(p.lat)]);
const same = (a: Pt, b: Pt) => a[0] === b[0] && a[1] === b[1];

/** Joins open outer ways end to end into closed rings; pieces that never close are dropped. */
export function stitchRings(pieces: Pt[][]): Pt[][] {
  const open = pieces.filter((p) => p.length >= 2).map((p) => [...p]);
  const rings: Pt[][] = [];
  while (open.length) {
    let ring = open.shift()!;
    let grew = true;
    while (!same(ring[0]!, ring.at(-1)!) && grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const p = open[i]!;
        const end = ring.at(-1)!;
        if (same(end, p[0]!)) ring = [...ring, ...p.slice(1)];
        else if (same(end, p.at(-1)!)) ring = [...ring, ...p.slice(0, -1).reverse()];
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0]!, ring.at(-1)!)) rings.push(ring);
  }
  return rings;
}

/** Shoelace area in square degrees (only used to keep the largest areas first). */
const ringArea = (r: Pt[]) => {
  let a = 0;
  for (let i = 1; i < r.length; i++) a += r[i - 1]![0] * r[i]![1] - r[i]![0] * r[i - 1]![1];
  return Math.abs(a / 2);
};

export function parseGreenSpace(
  json: unknown,
  ctx: { tile: string; bbox: Bbox; provenance: Provenance },
): GreenSpace {
  const raw = Raw.safeParse(json);
  if (!raw.success) throw new ProviderError('BAD_RESPONSE', 'overpass', 'Unexpected Overpass shape');
  const areas: Array<GreenSpace['areas'][number] & { size: number }> = [];
  for (const item of raw.data.elements) {
    const el = Element.safeParse(item);
    if (!el.success || el.data.type === 'node' || !el.data.tags) continue;
    const kind = greenKind(el.data.tags);
    if (!kind) continue;
    let rings: Pt[][];
    if (el.data.type === 'way') {
      const pts = toPts(el.data.geometry);
      rings = pts.length >= 4 && same(pts[0]!, pts.at(-1)!) ? [pts] : [];
    } else {
      rings = stitchRings(
        (el.data.members ?? [])
          .filter((m) => m.type === 'way' && m.role !== 'inner')
          .map((m) => toPts(m.geometry)),
      );
    }
    if (!rings.length) continue;
    areas.push({
      id: `${el.data.type}/${el.data.id}`,
      kind,
      name: el.data.tags.name?.trim().slice(0, 120) || null,
      rings,
      size: rings.reduce((t, r) => t + ringArea(r), 0),
    });
  }
  areas.sort((a, b) => b.size - a.size);
  const kept: GreenSpace['areas'] = [];
  let points = 0;
  for (const { size: _size, ...a } of areas) {
    const n = a.rings.reduce((t, r) => t + r.length, 0);
    if (kept.length >= MAX_AREAS || points + n > MAX_POINTS) continue;
    kept.push(a);
    points += n;
  }
  return {
    provenance: ctx.provenance,
    tile: ctx.tile,
    bbox: ctx.bbox,
    areas: kept,
    truncated: kept.length < areas.length,
  };
}
