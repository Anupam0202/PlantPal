import type { LayoutBody, LayoutItem, NumRange } from '@plantpal/schemas';
import {
  circleOverlapArea,
  vDist,
  footprint,
  pointInPolygon,
  polygonArea,
  polygonInside,
  type Vec,
} from './geometry';

/** What the conflicts panel needs to know about a plant, from the catalogue. */
export interface PlantFacts {
  name: string;
  spreadCm: NumRange | null;
  heightCm: NumRange | null;
  minContainerL: number | null;
  sunHours: NumRange | null;
}

export type ConflictKind =
  'spacing' | 'container-small' | 'light' | 'height' | 'path-narrow' | 'outside' | 'not-in-container';

export interface Conflict {
  kind: ConflictKind;
  itemIds: string[];
  /** Numbers for the message (rounded for display by the UI). */
  params: Record<string, number | string>;
}

export interface ConflictContext {
  facts: (item: LayoutItem) => PlantFacts | null;
  /** Direct-sun hours at a point this month (from the sun worker), or the zone value, or null. */
  sunHoursAt: (x: number, y: number) => number | null;
  /** Free height above the space (ceiling or overhang), when known. */
  clearanceM: number | null;
}

const PLACED = new Set([
  'container',
  'bed',
  'tank',
  'compost',
  'insect-hotel',
  'bird-bath',
  'seating',
  'path',
]);
export const MIN_PATH_M = 0.6;

/** Substrate volume of a container or bed, from its dimensions. */
export function itemVolumeL(
  item: Pick<LayoutItem, 'shape' | 'lengthM' | 'widthM' | 'diameterM' | 'depthM'>,
): number | null {
  if (item.depthM === null || !(item.depthM > 0)) return null;
  const area = item.shape === 'round' ? Math.PI * (item.diameterM / 2) ** 2 : item.lengthM * item.widthM;
  return Math.round(area * item.depthM * 1000);
}

/** Every conflict on the plan (§6.7). Rules only; the numbers come from the catalogue ranges. */
export function findConflicts(layout: LayoutBody, ctx: ConflictContext): Conflict[] {
  const out: Conflict[] = [];
  const outline = layout.outline as Vec[];
  const byId = new Map(layout.items.map((i) => [i.id, i]));
  const plants = layout.items.filter((i) => i.kind === 'plant');

  // Items outside the outline.
  for (const it of layout.items) {
    if (!PLACED.has(it.kind)) continue;
    if (!polygonInside(footprint(it), outline))
      out.push({ kind: 'outside', itemIds: [it.id], params: { label: it.label } });
  }

  // Paths narrower than 60 cm.
  for (const p of layout.items.filter((i) => i.kind === 'path')) {
    const w = Math.min(p.lengthM, p.widthM);
    if (w < MIN_PATH_M)
      out.push({
        kind: 'path-narrow',
        itemIds: [p.id],
        params: { widthCm: Math.round(w * 100), minCm: MIN_PATH_M * 100 },
      });
  }

  for (const pl of plants) {
    const facts = ctx.facts(pl);
    const holder = pl.inId ? byId.get(pl.inId) : undefined;
    // A plant should sit inside the container or bed it is assigned to.
    if (holder && !pointInPolygon([pl.x, pl.y], footprint(holder)))
      out.push({
        kind: 'not-in-container',
        itemIds: [pl.id, holder.id],
        params: { plant: pl.label, holder: holder.label },
      });
    if (!facts) continue;

    // Container too small for the plant's minimum.
    if (holder && facts.minContainerL !== null) {
      const vol = itemVolumeL(holder);
      if (vol !== null && vol < facts.minContainerL)
        out.push({
          kind: 'container-small',
          itemIds: [pl.id, holder.id],
          params: { plant: facts.name, volumeL: vol, minL: facts.minContainerL },
        });
    }

    // Light: hours at this spot vs the plant's minimum.
    const hours = ctx.sunHoursAt(pl.x, pl.y);
    if (hours !== null && facts.sunHours && hours < facts.sunHours.min)
      out.push({
        kind: 'light',
        itemIds: [pl.id],
        params: { plant: facts.name, hours: Math.round(hours * 10) / 10, minHours: facts.sunHours.min },
      });

    // Height vs ceiling or overhang.
    if (ctx.clearanceM !== null && facts.heightCm && facts.heightCm.max / 100 > ctx.clearanceM)
      out.push({
        kind: 'height',
        itemIds: [pl.id],
        params: {
          plant: facts.name,
          heightCm: facts.heightCm.max,
          clearanceCm: Math.round(ctx.clearanceM * 100),
        },
      });
  }

  // Spacing: mature spread circles overlapping by more than a fifth of the smaller one.
  for (let i = 0; i < plants.length; i++)
    for (let j = i + 1; j < plants.length; j++) {
      const a = plants[i]!;
      const b = plants[j]!;
      const fa = ctx.facts(a);
      const fb = ctx.facts(b);
      if (!fa?.spreadCm || !fb?.spreadCm) continue;
      const ra = fa.spreadCm.max / 200;
      const rb = fb.spreadCm.max / 200;
      const overlap = circleOverlapArea(ra, rb, vDist([a.x, a.y], [b.x, b.y]));
      const smaller = Math.PI * Math.min(ra, rb) ** 2;
      if (overlap > 0.2 * smaller)
        out.push({
          kind: 'spacing',
          itemIds: [a.id, b.id],
          params: { a: fa.name, b: fb.name, overlapPct: Math.round((overlap / smaller) * 100) },
        });
    }
  return out;
}

/** Visible assumptions for the saturated-load estimate. */
export const LOAD_ASSUMPTIONS = {
  /** Saturated potting mix, kg per litre (typical range 1.0–1.4). */
  substrateKgPerL: 1.2,
  /** Pot or bed shell as a share of its wet substrate weight. */
  shellShare: 0.1,
  /** Water, kg per litre. */
  waterKgPerL: 1,
  /** Tanks are counted full. */
  tankFull: true,
} as const;

export interface LoadEstimate {
  totalKg: number;
  areaM2: number;
  kgPerM2: number | null;
  lines: Array<{ itemId: string; label: string; kg: number; basis: string }>;
  /** Containers without a depth are left out and listed. */
  unknown: string[];
}

/**
 * Estimated saturated load (wet substrate + water + containers). Not a structural assessment:
 * people, furniture, snow and how the load is spread are not included.
 */
export function estimateLoad(layout: LayoutBody): LoadEstimate {
  const lines: LoadEstimate['lines'] = [];
  const unknown: string[] = [];
  for (const it of layout.items) {
    if (it.kind === 'container' || it.kind === 'bed') {
      const vol = itemVolumeL(it);
      if (vol === null) {
        unknown.push(it.label || it.id);
        continue;
      }
      const kg = vol * LOAD_ASSUMPTIONS.substrateKgPerL * (1 + LOAD_ASSUMPTIONS.shellShare);
      lines.push({
        itemId: it.id,
        label: it.label,
        kg: Math.round(kg),
        basis: `${vol} L × ${LOAD_ASSUMPTIONS.substrateKgPerL} kg/L + shell`,
      });
    } else if (it.kind === 'tank' && it.volumeL !== null) {
      const kg = it.volumeL * LOAD_ASSUMPTIONS.waterKgPerL * (1 + LOAD_ASSUMPTIONS.shellShare);
      lines.push({
        itemId: it.id,
        label: it.label,
        kg: Math.round(kg),
        basis: `${it.volumeL} L water, full + shell`,
      });
    }
  }
  const totalKg = lines.reduce((s, l) => s + l.kg, 0);
  const areaM2 = Math.round(polygonArea(layout.outline as Vec[]) * 100) / 100;
  return { totalKg, areaM2, kgPerM2: areaM2 > 0 ? Math.round(totalKg / areaM2) : null, lines, unknown };
}
