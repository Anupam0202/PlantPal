import { encode } from 'uqr';
import { pdfFromJpegPages } from './pdf';

export type LabelSize = 'stake' | 'front';

/** Physical sizes in millimetres: a strip for pot stakes, and a card for container fronts. */
export const LABEL_SIZES: Record<LabelSize, { w: number; h: number }> = {
  stake: { w: 90, h: 25 },
  front: { w: 70, h: 45 },
};

export interface LabelData {
  name: string;
  scientificName: string | null;
  plantedOn: string | null;
  /** Up to three short care basics, already in the person's language. */
  basics: string[];
  /** Where the QR code leads: the plant's page in PlantPal. */
  url: string;
}

const A4 = { w: 210, h: 297 };
const MARGIN = 10;
const GAP = 4;
const DPI = 300;
const px = (mm: number) => Math.round((mm / 25.4) * DPI);

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const qr = encode(text, { ecc: 'M', border: 1 });
  const cell = size / qr.size;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#000';
  qr.data.forEach((row, r) =>
    row.forEach((on, c) => {
      if (on) ctx.fillRect(x + c * cell, y + r * cell, Math.ceil(cell), Math.ceil(cell));
    }),
  );
}

/** Shrinks text until it fits the width, then cuts it with an ellipsis as a last resort. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  font: (s: number) => string,
  size: number,
) {
  let s = size;
  ctx.font = font(s);
  while (ctx.measureText(text).width > maxW && s > size * 0.6) {
    s -= 2;
    ctx.font = font(s);
  }
  let t = text;
  while (ctx.measureText(t).width > maxW && t.length > 1) t = `${t.slice(0, -2)}…`;
  return t;
}

function drawLabel(ctx: CanvasRenderingContext2D, l: LabelData, x: number, y: number, size: LabelSize) {
  const w = px(LABEL_SIZES[size].w);
  const h = px(LABEL_SIZES[size].h);
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  const pad = px(2.5);
  const qrSize = h - pad * 2 - (size === 'front' ? px(14) : 0);
  drawQr(ctx, l.url, x + w - pad - qrSize, y + pad, qrSize);
  const textW = w - pad * 3 - qrSize;
  const sans = (s: number) => `600 ${s}px Inter Variable, system-ui, sans-serif`;
  const italic = (s: number) => `italic 400 ${s}px Inter Variable, system-ui, sans-serif`;
  const plain = (s: number) => `400 ${s}px Inter Variable, system-ui, sans-serif`;
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';
  let ty = y + pad;
  const nameSize = size === 'stake' ? px(5) : px(5.5);
  ctx.fillText(fitText(ctx, l.name, textW, sans, nameSize), x + pad, ty);
  ty += nameSize * 1.15;
  if (l.scientificName) {
    const s = px(3.4);
    ctx.fillText(fitText(ctx, l.scientificName, textW, italic, s), x + pad, ty);
    ty += s * 1.25;
  }
  const small = px(3);
  if (l.plantedOn) {
    ctx.fillText(fitText(ctx, l.plantedOn, textW, plain, small), x + pad, ty);
    ty += small * 1.25;
  }
  // Care basics: under the text on stakes, across the full width on container fronts.
  const basicsW = size === 'front' ? w - pad * 2 : textW;
  if (size === 'front') ty = Math.max(ty, y + pad + qrSize + px(1.5));
  for (const b of l.basics.slice(0, 3)) {
    if (ty + small > y + h - pad) break;
    ctx.fillText(fitText(ctx, b, basicsW, plain, small), x + pad, ty);
    ty += small * 1.25;
  }
}

/** Lays labels out on A4 pages at 300 dpi and returns a PDF. */
export async function labelsPdf(labels: LabelData[], size: LabelSize): Promise<Blob> {
  const W = px(A4.w);
  const H = px(A4.h);
  const lw = px(LABEL_SIZES[size].w);
  const lh = px(LABEL_SIZES[size].h);
  const cols = Math.max(1, Math.floor((A4.w - MARGIN * 2 + GAP) / (LABEL_SIZES[size].w + GAP)));
  const rows = Math.max(1, Math.floor((A4.h - MARGIN * 2 + GAP) / (LABEL_SIZES[size].h + GAP)));
  const perPage = cols * rows;
  const pages = [];
  for (let start = 0; start < labels.length; start += perPage) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    labels.slice(start, start + perPage).forEach((l, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      drawLabel(ctx, l, px(MARGIN) + c * (lw + px(GAP)), px(MARGIN) + r * (lh + px(GAP)), size);
    });
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not draw the page'))),
        'image/jpeg',
        0.92,
      ),
    );
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), widthPx: W, heightPx: H });
  }
  const bytes = pdfFromJpegPages(pages, A4);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}
