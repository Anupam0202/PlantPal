// @vitest-environment node
import type { LayoutBody } from '@plantpal/schemas';
import { describe, expect, it } from 'vitest';
import { placeDetections, type Detection } from '../src/features/designer/photoPlan';
import { canonical, defaultItem, shiftItem } from '../src/features/designer/useDesigner';

const body: LayoutBody = {
  name: 'Balcony',
  frame: { frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: 0 },
  outline: [
    [0, 0],
    [3, 0],
    [3, 1.5],
    [0, 1.5],
  ],
  items: [],
};

const det = (label: Detection['label'], box: number[], note = ''): Detection => ({
  label,
  box_2d: box,
  note,
});

describe('Photo-to-Plan placement', () => {
  // A 1000 × 500 px photo: one box unit is 1 px across and 0.5 px down.
  const opts = { imgW: 1000, imgH: 500, refIndex: 0, refWidthCm: 30, body, draftNote: 'Draft' };

  it('scales every item from the one known width', () => {
    const items = placeDetections(
      [det('pot', [600, 100, 800, 200], 'Terracotta pot'), det('pot', [600, 400, 800, 600])],
      opts,
    );
    expect(items).toHaveLength(2);
    // 100 px = 30 cm, so 3 mm per px.
    expect(items[0]).toMatchObject({ kind: 'container', shape: 'round', diameterM: 0.3, x: 0.45 });
    expect(items[1]).toMatchObject({ diameterM: 0.6, x: 1.5 });
    expect(items[0]?.label).toBe('Terracotta pot');
    expect(items.every((i) => i.note === 'Draft')).toBe(true);
  });

  it('draws railings and walls as lines and keeps everything inside the outline', () => {
    const items = placeDetections(
      [det('pot', [600, 0, 800, 100]), det('railing', [400, 0, 900, 1000]), det('other', [0, 0, 100, 100])],
      opts,
    );
    const rail = items[1];
    expect(rail).toMatchObject({ kind: 'railing', shape: 'line', x: 0 });
    // 1000 px × 3 mm = 3 m, clamped to the 3 m outline.
    expect(rail?.x2).toBe(3);
    for (const i of items) {
      expect(i.x).toBeGreaterThanOrEqual(0);
      expect(i.x).toBeLessThanOrEqual(3);
      expect(i.y).toBeGreaterThanOrEqual(0);
      expect(i.y).toBeLessThanOrEqual(1.5);
    }
    expect(items[2]?.kind).toBe('note');
  });

  it('places nothing without a usable scale', () => {
    expect(placeDetections([det('pot', [0, 100, 10, 100])], opts)).toEqual([]);
    expect(placeDetections([det('pot', [0, 0, 10, 100])], { ...opts, refWidthCm: 0 })).toEqual([]);
    expect(placeDetections([], opts)).toEqual([]);
  });
});

describe('canonical', () => {
  it('ignores key order so a validated body still counts as saved', () => {
    const a = { ...body, items: [] };
    const b = {
      items: [],
      outline: body.outline,
      frame: { rotationDeg: 0, origin: [0, 0], unit: 'm', frame: 'local-metric' },
      name: 'Balcony',
    } as LayoutBody;
    expect(canonical(a)).toBe(canonical(b));
    expect(canonical({ ...a, name: 'Other' })).not.toBe(canonical(b));
  });
});

describe('moving', () => {
  it('carries plants with their container and leaves other items alone', () => {
    const pot = { ...defaultItem('container', body, null), id: 'pot' };
    const basil = { ...defaultItem('plant', body, pot), id: 'basil' };
    const loose = { ...defaultItem('plant', body, null), id: 'loose', x: 2, y: 1 };
    const moved = shiftItem({ ...body, items: [pot, basil, loose] }, 'pot', 0.3, -0.1);
    const at = (id: string) => moved.items.find((i) => i.id === id)!;
    expect([at('pot').x, at('pot').y]).toEqual(
      [pot.x + 0.3, pot.y - 0.1].map((v) => Math.round(v * 100) / 100),
    );
    expect([at('basil').x, at('basil').y]).toEqual([at('pot').x, at('pot').y]);
    expect([at('loose').x, at('loose').y]).toEqual([2, 1]);
  });
});
