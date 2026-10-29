import { bbox, snap, type Vec } from '@plantpal/domain';
import type { LayoutBody, LayoutItem, LayoutKind, LayoutLayer } from '@plantpal/schemas';
import { useCallback, useMemo, useRef, useState } from 'react';

export const LAYER_OF: Record<LayoutKind, LayoutLayer> = {
  wall: 'structure',
  railing: 'structure',
  door: 'structure',
  window: 'structure',
  overhang: 'structure',
  path: 'structure',
  container: 'containers',
  bed: 'containers',
  trellis: 'containers',
  tank: 'containers',
  compost: 'containers',
  'insect-hotel': 'containers',
  'bird-bath': 'containers',
  seating: 'containers',
  plant: 'plants',
  note: 'notes',
};

const BASE: Omit<LayoutItem, 'id' | 'kind'> = {
  label: '',
  shape: 'rect',
  x: 0,
  y: 0,
  x2: 0,
  y2: 0,
  lengthM: 0,
  widthM: 0,
  diameterM: 0,
  rotationDeg: 0,
  heightM: null,
  depthM: null,
  volumeL: null,
  solid: false,
  specimenId: null,
  taxonId: null,
  containerId: null,
  inId: null,
  note: '',
};

let counter = 0;
export function newItemId(): string {
  counter = (counter + 1) % 1_000_000;
  return `i${Date.now().toString(36)}${counter.toString(36)}`;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A new item of `kind` with sensible metric defaults, placed in the space (or in the selected pot). */
export function defaultItem(kind: LayoutKind, body: LayoutBody, near: LayoutItem | null): LayoutItem {
  const b = bbox(body.outline as Vec[]);
  const cx = snap((b.minX + b.maxX) / 2);
  const cy = snap((b.minY + b.maxY) / 2);
  const w = b.maxX - b.minX;
  const it = { ...BASE, id: newItemId(), kind, x: cx, y: cy };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    heightM: number | null,
    solid: boolean,
  ): LayoutItem => ({
    ...it,
    shape: 'line',
    x: r2(x),
    y: r2(y),
    x2: r2(x2),
    y2: r2(y2),
    heightM,
    solid,
  });
  switch (kind) {
    case 'wall':
      return line(b.minX, b.minY, b.maxX, b.minY, 2.5, true);
    case 'railing':
      return line(b.minX, b.maxY, b.maxX, b.maxY, 1, false);
    case 'door':
      return line(b.minX + 0.3, b.minY, b.minX + 1.2, b.minY, null, false);
    case 'window':
      return line(cx - 0.6, b.minY, cx + 0.6, b.minY, null, false);
    case 'trellis':
      return line(cx - 0.5, cy, cx + 0.5, cy, 1.8, false);
    case 'overhang':
      return { ...it, x: cx, y: r2(b.minY + 0.3), lengthM: r2(w), widthM: 0.6, heightM: 2.6, solid: true };
    case 'path':
      return { ...it, lengthM: 1, widthM: 0.6 };
    case 'container':
      return { ...it, shape: 'round', diameterM: 0.3, depthM: 0.25 };
    case 'bed':
      return { ...it, lengthM: 1.2, widthM: 0.6, depthM: 0.3 };
    case 'tank':
      return { ...it, shape: 'round', diameterM: 0.5, volumeL: 100, heightM: 0.8, solid: true };
    case 'compost':
      return { ...it, lengthM: 0.6, widthM: 0.6, heightM: 0.8, solid: true };
    case 'insect-hotel':
      return { ...it, lengthM: 0.3, widthM: 0.15 };
    case 'bird-bath':
      return { ...it, shape: 'round', diameterM: 0.4 };
    case 'seating':
      return { ...it, lengthM: 1.2, widthM: 0.5 };
    case 'plant':
      return {
        ...it,
        shape: 'round',
        diameterM: 0.1,
        ...(near && (near.kind === 'container' || near.kind === 'bed')
          ? { x: near.x, y: near.y, inId: near.id }
          : {}),
      };
    case 'note':
      return { ...it, lengthM: 0.6, widthM: 0.3, note: '' };
  }
}

interface State {
  body: LayoutBody;
  selected: string | null;
  past: LayoutBody[];
  future: LayoutBody[];
}

const HISTORY = 100;

/** Moves an item by (dx, dy); plants growing in it move with it. */
export function shiftItem(b: LayoutBody, id: string, dx: number, dy: number): LayoutBody {
  if (dx === 0 && dy === 0) return b;
  return {
    ...b,
    items: b.items.map((i) =>
      i.id === id || i.inId === id
        ? {
            ...i,
            x: r2(i.x + dx),
            y: r2(i.y + dy),
            ...(i.shape === 'line' ? { x2: r2(i.x2 + dx), y2: r2(i.y2 + dy) } : {}),
          }
        : i,
    ),
  };
}

/** Key-order independent text, so a body that went through validation still compares equal. */
export function canonical(b: LayoutBody): string {
  return JSON.stringify(b, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [c]) => (a < c ? -1 : a > c ? 1 : 0)))
      : v,
  );
}

/** Editor state with undo and redo. Drags update live and commit one history step on release. */
export function useDesigner(initial: LayoutBody) {
  const [s, setS] = useState<State>({ body: initial, selected: null, past: [], future: [] });
  const [saved, setSaved] = useState(() => canonical(initial));
  const dragStart = useRef<LayoutBody | null>(null);

  const apply = useCallback((fn: (b: LayoutBody) => LayoutBody, select?: string | null) => {
    setS((cur) => {
      const next = fn(cur.body);
      if (next === cur.body) return select === undefined ? cur : { ...cur, selected: select };
      return {
        body: next,
        selected: select === undefined ? cur.selected : select,
        past: [...cur.past, cur.body].slice(-HISTORY),
        future: [],
      };
    });
  }, []);

  const mapItem = (id: string, f: (i: LayoutItem) => LayoutItem) => (b: LayoutBody) => ({
    ...b,
    items: b.items.map((i) => (i.id === id ? f(i) : i)),
  });

  const actions = useMemo(
    () => ({
      select: (id: string | null) => setS((cur) => ({ ...cur, selected: id })),
      add: (kind: LayoutKind) =>
        setS((cur) => {
          const near = cur.body.items.find((i) => i.id === cur.selected) ?? null;
          const item = defaultItem(kind, cur.body, near);
          return {
            body: { ...cur.body, items: [...cur.body.items, item] },
            selected: item.id,
            past: [...cur.past, cur.body].slice(-HISTORY),
            future: [],
          };
        }),
      update: (id: string, patch: Partial<LayoutItem>) => apply(mapItem(id, (i) => ({ ...i, ...patch }))),
      move: (id: string, dx: number, dy: number) => apply((b) => shiftItem(b, id, dx, dy)),
      rotate: (id: string, deg: number) =>
        apply(mapItem(id, (i) => ({ ...i, rotationDeg: (((i.rotationDeg + deg) % 360) + 360) % 360 }))),
      remove: (id: string) =>
        apply(
          (b) => ({
            ...b,
            items: b.items.filter((i) => i.id !== id).map((i) => (i.inId === id ? { ...i, inId: null } : i)),
          }),
          null,
        ),
      duplicate: (id: string) =>
        setS((cur) => {
          const src = cur.body.items.find((i) => i.id === id);
          if (!src) return cur;
          const copy = {
            ...src,
            id: newItemId(),
            x: r2(src.x + 0.2),
            y: r2(src.y + 0.2),
            x2: r2(src.x2 + 0.2),
            y2: r2(src.y2 + 0.2),
          };
          return {
            body: { ...cur.body, items: [...cur.body.items, copy] },
            selected: copy.id,
            past: [...cur.past, cur.body].slice(-HISTORY),
            future: [],
          };
        }),
      setBody: (fn: (b: LayoutBody) => LayoutBody) => apply(fn),
      /** Live update during a drag, without a history step. */
      dragTo: (id: string, x: number, y: number) =>
        setS((cur) => {
          dragStart.current ??= cur.body;
          const it = cur.body.items.find((i) => i.id === id);
          if (!it) return cur;
          return { ...cur, body: shiftItem(cur.body, id, r2(x - it.x), r2(y - it.y)) };
        }),
      endDrag: () =>
        setS((cur) => {
          const start = dragStart.current;
          dragStart.current = null;
          if (!start || start === cur.body) return cur;
          return { ...cur, past: [...cur.past, start].slice(-HISTORY), future: [] };
        }),
      undo: () =>
        setS((cur) => {
          const prev = cur.past[cur.past.length - 1];
          if (!prev) return cur;
          return { ...cur, body: prev, past: cur.past.slice(0, -1), future: [cur.body, ...cur.future] };
        }),
      redo: () =>
        setS((cur) => {
          const next = cur.future[0];
          if (!next) return cur;
          return { ...cur, body: next, past: [...cur.past, cur.body], future: cur.future.slice(1) };
        }),
      markSaved: (b: LayoutBody) => setSaved(canonical(b)),
      reset: (b: LayoutBody) => {
        setSaved(canonical(b));
        setS({ body: b, selected: null, past: [], future: [] });
      },
    }),
    [apply],
  );

  const selected = s.body.items.find((i) => i.id === s.selected) ?? null;
  const current = useMemo(() => canonical(s.body), [s.body]);
  return {
    body: s.body,
    selected,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
    dirty: current !== saved,
    ...actions,
  };
}

export type Designer = ReturnType<typeof useDesigner>;
