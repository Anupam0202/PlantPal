import { bbox, type Vec } from '@plantpal/domain';
import type { LayoutBody, LayoutItem, LayoutKind, SpaceDetections } from '@plantpal/schemas';
import { defaultItem } from './useDesigner';

export type Detection = SpaceDetections['items'][number];

const KIND: Record<Detection['label'], LayoutKind> = {
  pot: 'container',
  planter: 'container',
  railing: 'railing',
  wall: 'wall',
  door: 'door',
  window: 'window',
  bed: 'bed',
  seating: 'seating',
  tank: 'tank',
  other: 'note',
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const size = (v: number) => r2(clamp(v, 0.05, 20));

/** Box width in image pixels. Boxes are [ymin, xmin, ymax, xmax] on a 0–1000 grid. */
export function boxWidthPx(d: Detection, imgW: number): number {
  const [, x0, , x1] = d.box_2d as [number, number, number, number];
  return ((x1 - x0) / 1000) * imgW;
}

/**
 * Turns detections into draft layout items, scaled from one item whose real width the person knows.
 * A single photo has perspective, so positions are rough: left–right comes from the photo, front–back
 * from where each item meets the floor. Everything lands inside the outline and is labelled as a draft.
 */
export function placeDetections(
  detections: readonly Detection[],
  opts: {
    imgW: number;
    imgH: number;
    refIndex: number;
    refWidthCm: number;
    body: LayoutBody;
    draftNote: string;
  },
): LayoutItem[] {
  const ref = detections[opts.refIndex];
  const refPx = ref ? boxWidthPx(ref, opts.imgW) : 0;
  if (!ref || refPx <= 0 || !(opts.refWidthCm > 0)) return [];
  const mPerPx = opts.refWidthCm / 100 / refPx;
  const b = bbox(opts.body.outline as Vec[]);
  const px = (v: number, full: number) => (v / 1000) * full * mPerPx;
  const floorTop = Math.min(...detections.map((d) => d.box_2d[2] ?? 1000));

  return detections.map((d) => {
    const [, x0, y1, x1] = d.box_2d as [number, number, number, number];
    const kind = KIND[d.label];
    const base = defaultItem(kind, opts.body, null);
    const left = clamp(b.minX + px(x0, opts.imgW), b.minX, b.maxX);
    const right = clamp(b.minX + px(x1, opts.imgW), b.minX, b.maxX);
    const cx = r2((left + right) / 2);
    const y = r2(clamp(b.minY + px(y1 - floorTop, opts.imgH), b.minY, b.maxY));
    const w = size(right - left);
    const label = d.note.trim().slice(0, 80);
    const common = { ...base, label, note: opts.draftNote.slice(0, 200) };
    if (base.shape === 'line') return { ...common, x: r2(left), y, x2: r2(right), y2: y };
    if (kind === 'container' && d.label === 'pot')
      return { ...common, x: cx, y, shape: 'round', diameterM: w };
    if (kind === 'tank') return { ...common, x: cx, y, diameterM: w };
    return { ...common, x: cx, y, shape: 'rect', lengthM: w, widthM: size(Math.min(w, base.widthM || 0.4)) };
  });
}
