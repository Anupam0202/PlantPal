import type { LayoutBody, LayoutItem } from '@plantpal/schemas';
import { bbox, footprint, type Vec } from './geometry';

/** Escapes text for XML attributes and content. */
export function xml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
}

const FILL: Partial<Record<LayoutItem['kind'], string>> = {
  container: '#c9a27e',
  bed: '#b08968',
  tank: '#7aa6c2',
  compost: '#7f6a4f',
  'insect-hotel': '#d4a373',
  'bird-bath': '#a8dadc',
  seating: '#bcb8b1',
  path: '#e9e5dc',
  overhang: '#9aa0a6',
};

export interface SvgOptions {
  title: string;
  /** Mature spread radius (m) for plant circles, when known. */
  spreadM?: (item: LayoutItem) => number | null;
  /** Pixels per metre in the output. */
  pxPerM?: number;
}

/**
 * Self-contained SVG with a legend, a north arrow and a scale bar. Coordinates stay in metres (via a
 * viewBox) so the drawing is to scale.
 */
export function layoutSvg(body: LayoutBody, o: SvgOptions): string {
  const pts: Vec[] = [...(body.outline as Vec[]), ...body.items.flatMap((i) => footprint(i, 16))];
  const b = bbox(pts);
  const pad = 0.4;
  const legendH = 0.9;
  const x0 = b.minX - pad;
  const y0 = b.minY - pad;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2 + legendH;
  const px = o.pxPerM ?? 100;
  const poly = (p: readonly Vec[]) => p.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
  const parts: string[] = [];
  parts.push(
    `<polygon points="${poly(body.outline as Vec[])}" fill="#f7f4ec" stroke="#3a3a3a" stroke-width="0.03"/>`,
  );
  for (const it of body.items) {
    if (it.shape === 'line') {
      const sw = it.kind === 'wall' ? 0.12 : 0.05;
      const dash = it.kind === 'railing' ? ' stroke-dasharray="0.1 0.06"' : '';
      parts.push(
        `<line x1="${it.x}" y1="${it.y}" x2="${it.x2}" y2="${it.y2}" stroke="#3a3a3a" stroke-width="${sw}"${dash}/>`,
      );
      continue;
    }
    if (it.kind === 'plant') {
      const r = o.spreadM?.(it) ?? 0.15;
      parts.push(
        `<circle cx="${it.x}" cy="${it.y}" r="${r.toFixed(3)}" fill="#7cb342" fill-opacity="0.35" stroke="#33691e" stroke-width="0.02"/>`,
      );
      parts.push(`<circle cx="${it.x}" cy="${it.y}" r="0.04" fill="#33691e"/>`);
    } else {
      parts.push(
        `<polygon points="${poly(footprint(it, 32))}" fill="${FILL[it.kind] ?? '#dddddd'}" stroke="#555" stroke-width="0.02"/>`,
      );
    }
    if (it.label)
      parts.push(
        `<text x="${it.x}" y="${(it.y + 0.05).toFixed(3)}" font-size="0.12" text-anchor="middle" fill="#222">${xml(it.label)}</text>`,
      );
  }
  // Scale bar (1 m) and north arrow in the legend strip.
  const ly = b.maxY + pad + 0.4;
  parts.push(
    `<line x1="${x0 + 0.3}" y1="${ly}" x2="${x0 + 1.3}" y2="${ly}" stroke="#222" stroke-width="0.04"/>`,
  );
  parts.push(
    `<text x="${x0 + 0.8}" y="${ly - 0.08}" font-size="0.14" text-anchor="middle" fill="#222">1 m</text>`,
  );
  const nx = x0 + 1.9;
  const r = ((body.frame.rotationDeg * Math.PI) / 180) * -1;
  const tip: Vec = [nx + 0.25 * Math.sin(r), ly - 0.25 * Math.cos(r)];
  parts.push(
    `<line x1="${nx}" y1="${ly}" x2="${tip[0].toFixed(3)}" y2="${tip[1].toFixed(3)}" stroke="#222" stroke-width="0.03"/>`,
  );
  parts.push(
    `<text x="${tip[0].toFixed(3)}" y="${(tip[1] - 0.05).toFixed(3)}" font-size="0.14" text-anchor="middle" fill="#222">N</text>`,
  );
  parts.push(
    `<text x="${x0 + 2.4}" y="${ly + 0.05}" font-size="0.13" fill="#222">${xml(o.title)} · metres, local frame</text>`,
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * px)}" height="${Math.round(h * px)}" viewBox="${x0.toFixed(3)} ${y0.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}" font-family="sans-serif">`,
    `<title>${xml(o.title)}</title>`,
    `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}
