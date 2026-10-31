import type { LayoutBody, LayoutItem } from '@plantpal/schemas';
import { addDays, startOfLocalDay, type LocalDate } from '../dates';
import { sunPosition } from '../solar';
import { horizonAt, type Horizon } from '../sunhours';
import { bbox, convexHull, footprint, pointInPolygon, vAdd, vScale, type Poly, type Vec } from './geometry';

/**
 * Sun and shade on the plan (§6.7): shadow polygons for one moment and direct-sun hours on a grid for
 * one day. Real geometry from the sun path, wall heights and overhangs; far obstacles come from the
 * zone's horizon profile when one is given.
 */

/** Unit vector in layout coordinates pointing away from the sun (where shadows fall). */
export function shadowDirection(sunAzimuthDeg: number, frameRotationDeg: number): Vec {
  const t = ((sunAzimuthDeg - frameRotationDeg) * Math.PI) / 180;
  // "Up" on the plan (−y) is the frame bearing; the sun's direction is (sin t, −cos t), shadows go the other way.
  return [-Math.sin(t), Math.cos(t)];
}

/** Ground shadow of one item for a sun at `elevationDeg`, or null when it casts none. */
export function itemShadow(item: LayoutItem, dir: Vec, elevationDeg: number): Poly | null {
  if (!item.solid || elevationDeg <= 0) return null;
  const h = item.heightM ?? 0;
  if (!(h > 0)) return null;
  const len = h / Math.tan((elevationDeg * Math.PI) / 180);
  const d = vScale(dir, Math.min(len, 200));
  const base = footprint(item, 16);
  if (item.kind === 'overhang') {
    // A slab at height h: its shadow is the slab moved along the shadow direction.
    return base.map((p) => vAdd(p, d));
  }
  // Walls and solid objects standing on the floor: the hull of the base and its projected top.
  return convexHull([...base, ...base.map((p) => vAdd(p, d))]);
}

export function shadowPolygons(layout: LayoutBody, sunAzimuthDeg: number, sunElevationDeg: number): Poly[] {
  const dir = shadowDirection(sunAzimuthDeg, layout.frame.rotationDeg);
  return layout.items.flatMap((it) => {
    const s = itemShadow(it, dir, sunElevationDeg);
    return s ? [s] : [];
  });
}

export interface SunGrid {
  x0: number;
  y0: number;
  cellM: number;
  cols: number;
  rows: number;
  /** Direct-sun hours per cell, row by row; NaN outside the outline. */
  hours: Float32Array;
}

export interface SunGridOptions {
  lat: number;
  lon: number;
  timeZone: string;
  date: LocalDate;
  /** Far obstacles (72 bins of 5°) from the zone's sun profile; null = open sky. */
  horizon: Horizon | null;
  cellM?: number;
  stepMin?: number;
}

/** Direct-sun hours on a grid (default 10 cm) for one day, sampled every `stepMin` minutes. */
export function sunHoursGrid(layout: LayoutBody, o: SunGridOptions): SunGrid {
  const cellM = o.cellM ?? 0.1;
  const step = (o.stepMin ?? 10) * 60_000;
  const outline = layout.outline as Vec[];
  const b = bbox(outline);
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / cellM));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / cellM));
  const hours = new Float32Array(cols * rows);
  const inside: boolean[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p: Vec = [b.minX + (c + 0.5) * cellM, b.minY + (r + 0.5) * cellM];
      const ok = pointInPolygon(p, outline);
      inside.push(ok);
      hours[r * cols + c] = ok ? 0 : Number.NaN;
    }
  const start = startOfLocalDay(o.date, o.timeZone);
  const end = startOfLocalDay(addDays(o.date, 1), o.timeZone);
  const stepH = step / 3_600_000;
  for (let t = start + step / 2; t < end; t += step) {
    const { elevation, azimuth } = sunPosition(t, o.lat, o.lon);
    const limit = o.horizon ? Math.max(horizonAt(o.horizon, azimuth), 0) : 0;
    if (elevation <= limit) continue;
    const shadows = shadowPolygons(layout, azimuth, elevation);
    const boxes = shadows.map((s) => bbox(s));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!inside[i]) continue;
        const p: Vec = [b.minX + (c + 0.5) * cellM, b.minY + (r + 0.5) * cellM];
        let shaded = false;
        for (let k = 0; k < shadows.length && !shaded; k++) {
          const bb = boxes[k]!;
          if (p[0] < bb.minX || p[0] > bb.maxX || p[1] < bb.minY || p[1] > bb.maxY) continue;
          shaded = pointInPolygon(p, shadows[k]!);
        }
        if (!shaded) hours[i]! += stepH;
      }
  }
  return { x0: b.minX, y0: b.minY, cellM, cols, rows, hours };
}

/** Hours at a point from a grid (nearest cell), or null outside it. */
export function hoursAt(grid: SunGrid, x: number, y: number): number | null {
  const c = Math.floor((x - grid.x0) / grid.cellM);
  const r = Math.floor((y - grid.y0) / grid.cellM);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
  const v = grid.hours[r * grid.cols + c]!;
  return Number.isNaN(v) ? null : v;
}
