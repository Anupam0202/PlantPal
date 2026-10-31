import type { LayoutItem } from '@plantpal/schemas';

/** Plane geometry in metres for the Space Designer (§6.7). */
export type Vec = readonly [number, number];
export type Poly = Vec[];

const EPS = 1e-9;

export const vAdd = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]];
export const vSub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]];
export const vScale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k];
export const vDist = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (o: Vec, a: Vec, b: Vec) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Rotates `p` clockwise on screen (y down) by `deg` around `c`. */
export function rotate(p: Vec, deg: number, c: Vec = [0, 0]): Vec {
  const r = (deg * Math.PI) / 180;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(r) - dy * Math.sin(r), c[1] + dx * Math.sin(r) + dy * Math.cos(r)];
}

/** Ground footprint of an item: a rotated rectangle, a circle as a polygon, or a segment. */
export function footprint(
  item: Pick<
    LayoutItem,
    'shape' | 'x' | 'y' | 'x2' | 'y2' | 'lengthM' | 'widthM' | 'diameterM' | 'rotationDeg'
  >,
  segments = 32,
): Poly {
  if (item.shape === 'line')
    return [
      [item.x, item.y],
      [item.x2, item.y2],
    ];
  const c: Vec = [item.x, item.y];
  if (item.shape === 'round') {
    const r = item.diameterM / 2;
    return Array.from({ length: segments }, (_, i) => {
      const a = (2 * Math.PI * i) / segments;
      return [item.x + r * Math.cos(a), item.y + r * Math.sin(a)] as Vec;
    });
  }
  const hl = item.lengthM / 2;
  const hw = item.widthM / 2;
  return (
    [
      [-hl, -hw],
      [hl, -hw],
      [hl, hw],
      [-hl, hw],
    ] as Vec[]
  ).map((p) => rotate(vAdd(c, p), item.rotationDeg, c));
}

export function polygonArea(p: readonly Vec[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function onSegment(p: Vec, a: Vec, b: Vec): boolean {
  return (
    Math.abs(cross(a, b, p)) <= 1e-7 &&
    p[0] >= Math.min(a[0], b[0]) - EPS &&
    p[0] <= Math.max(a[0], b[0]) + EPS &&
    p[1] >= Math.min(a[1], b[1]) - EPS &&
    p[1] <= Math.max(a[1], b[1]) + EPS
  );
}

/** Ray casting; points on the boundary count as inside. */
export function pointInPolygon(pt: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(pt, a, b)) return true;
    if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside;
  }
  return inside;
}

/** Proper crossing of two segments (touching at an end does not count). */
export function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return (
    ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
  );
}

const edges = (p: readonly Vec[]) => p.map((a, i) => [a, p[(i + 1) % p.length]!] as const);

/** True when no two non-adjacent edges cross, so the outline encloses one area. */
export function isSimplePolygon(p: readonly Vec[]): boolean {
  if (p.length < 3) return false;
  const e = edges(p);
  for (let i = 0; i < e.length; i++)
    for (let j = i + 2; j < e.length; j++) {
      if (i === 0 && j === e.length - 1) continue;
      if (segmentsCross(e[i]![0], e[i]![1], e[j]![0], e[j]![1])) return false;
    }
  return Math.abs(polygonArea(p)) > 1e-6;
}

/** True when every point of `inner` lies inside `outer` (works for concave outlines). */
export function polygonInside(inner: readonly Vec[], outer: readonly Vec[]): boolean {
  if (!inner.every((p) => pointInPolygon(p, outer))) return false;
  for (const [a, b] of edges(inner))
    for (const [c, d] of edges(outer)) if (segmentsCross(a, b, c, d)) return false;
  return true;
}

/** True when two polygons share any interior area. */
export function polygonsOverlap(a: readonly Vec[], b: readonly Vec[]): boolean {
  for (const [p, q] of edges(a)) for (const [r, s] of edges(b)) if (segmentsCross(p, q, r, s)) return true;
  const strictlyInside = (pt: Vec, poly: readonly Vec[]) =>
    pointInPolygon(pt, poly) && !edges(poly).some(([x, y]) => onSegment(pt, x, y));
  return (
    a.some((p) => strictlyInside(p, b)) ||
    b.some((p) => strictlyInside(p, a)) ||
    centroidInside(a, b) ||
    centroidInside(b, a)
  );
}

function centroidInside(a: readonly Vec[], b: readonly Vec[]): boolean {
  const c: Vec = [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length];
  return pointInPolygon(c, b) && pointInPolygon(c, a) && !edges(b).some(([x, y]) => onSegment(c, x, y));
}

/** Area shared by two circles of radius r1 and r2 whose centres are d apart. */
export function circleOverlapArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a + b - c;
}

/** Convex hull (Andrew's monotone chain), counter-clockwise in maths axes. */
export function convexHull(points: readonly Vec[]): Poly {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length <= 2) return pts;
  const lower: Vec[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Vec[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function bbox(points: readonly Vec[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Rounds to the snapping grid (default 10 cm). */
export function snap(v: number, step = 0.1): number {
  return Number((Math.round(v / step) * step).toFixed(6));
}
