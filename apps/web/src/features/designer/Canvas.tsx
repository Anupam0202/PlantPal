import { bbox, footprint, snap, type Poly, type SunGrid, type Vec } from '@plantpal/domain';
import type { LayoutItem, LayoutLayer } from '@plantpal/schemas';
import { IconButton } from '@plantpal/ui';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useDesignerT } from './messages';
import { LAYER_OF, type Designer } from './useDesigner';

export interface PlantSize {
  r: number;
  rMin: number;
  rMax: number;
}

const FILL: Partial<Record<LayoutItem['kind'], string>> = {
  container: 'var(--pp-clay, #c9a27e)',
  bed: '#b08968',
  tank: '#7aa6c2',
  compost: '#7f6a4f',
  'insect-hotel': '#d4a373',
  'bird-bath': '#a8dadc',
  seating: '#bcb8b1',
  path: '#e9e5dc',
  overhang: '#9aa0a6',
  note: '#fff3bf',
};

const pts = (p: readonly Vec[]) => p.map(([x, y]) => `${x},${y}`).join(' ');
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

/** The plan, drawn to scale in metres, with pointer and keyboard editing (§6.7). */
export function Canvas({
  d,
  layers,
  sizes,
  grid,
  shadows,
  flagged,
}: {
  d: Designer;
  layers: Record<LayoutLayer, boolean>;
  sizes: (item: LayoutItem) => PlantSize | null;
  grid: SunGrid | null;
  shadows: Poly[];
  flagged: ReadonlySet<string>;
}) {
  const m = useDesignerT();
  const svg = useRef<SVGSVGElement>(null);
  const outline = d.body.outline as Vec[];
  const fit = useMemo(() => {
    const b = bbox([...outline, ...d.body.items.flatMap((i) => footprint(i, 8))]);
    const pad = 0.5;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fit once per outline
  }, [d.body.outline]);
  const [view, setView] = useState(fit);
  useEffect(() => setView(fit), [fit]);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const toPlan = (clientX: number, clientY: number): Vec | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  const zoom = (k: number) =>
    setView((v) => {
      const w = Math.min(200, Math.max(0.5, v.w / k));
      const h = (v.h * w) / v.w;
      return { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    });

  const onBackgroundDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.target !== e.currentTarget && !(e.target as Element).hasAttribute('data-bg')) return;
    d.select(null);
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const p = toPlan(e.clientX, e.clientY);
      if (!p) return;
      const step = e.shiftKey ? 0.01 : 0.1;
      d.dragTo(drag.current.id, snap(p[0] - drag.current.ox, step), snap(p[1] - drag.current.oy, step));
      return;
    }
    if (pan.current && svg.current) {
      const k = view.w / svg.current.clientWidth;
      const start = pan.current;
      setView((v) => ({
        ...v,
        x: start.vx - (e.clientX - start.x) * k,
        y: start.vy - (e.clientY - start.y) * k,
      }));
    }
  };
  const onUp = () => {
    if (drag.current) d.endDrag();
    drag.current = null;
    pan.current = null;
  };

  const onItemDown = (it: LayoutItem) => (e: PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    d.select(it.id);
    const p = toPlan(e.clientX, e.clientY);
    if (!p) return;
    drag.current = { id: it.id, ox: p[0] - it.x, oy: p[1] - it.y };
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onItemKey = (it: LayoutItem) => (e: KeyboardEvent<SVGGElement>) => {
    const step = e.altKey ? 0.5 : e.shiftKey ? 0.01 : 0.1;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
    };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      d.move(it.id, mv[0], mv[1]);
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      d.rotate(it.id, e.shiftKey ? -15 : 15);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      d.remove(it.id);
    } else if (e.key === 'Escape') {
      d.select(null);
      (e.currentTarget as SVGGElement).blur();
    }
  };

  // Grid: 10 cm when zoomed in, 1 m lines always.
  const b = bbox(outline);
  const minor = view.w < 8 ? 0.1 : view.w < 20 ? 0.5 : 1;
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
  for (let x = Math.floor(b.minX); x <= b.maxX + 1e-9; x = Math.round((x + minor) * 1000) / 1000)
    lines.push({ x1: x, y1: b.minY, x2: x, y2: b.maxY, major: Math.abs(x - Math.round(x)) < 1e-6 });
  for (let y = Math.floor(b.minY); y <= b.maxY + 1e-9; y = Math.round((y + minor) * 1000) / 1000)
    lines.push({ x1: b.minX, y1: y, x2: b.maxX, y2: y, major: Math.abs(y - Math.round(y)) < 1e-6 });

  const visible = d.body.items.filter((i) => layers[LAYER_OF[i.kind]]);
  const order = (i: LayoutItem) => ['structure', 'containers', 'notes', 'plants'].indexOf(LAYER_OF[i.kind]);
  const font = Math.max(0.08, view.w / 60);

  return (
    <div className="relative">
      <svg
        ref={svg}
        role="group"
        aria-label={m.canvasLabel(d.body.name)}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-[min(60vh,520px)] w-full touch-none rounded-lg border border-line bg-sunken"
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15)}
        data-testid="designer-canvas"
      >
        <polygon
          points={pts(outline)}
          fill="var(--pp-surface, #fff)"
          stroke="var(--pp-ink, #333)"
          strokeWidth={0.03}
          data-bg=""
        />
        {lines.map((l, i) => (
          <line
            key={i}
            {...l}
            stroke="var(--pp-line, #ccc)"
            strokeWidth={l.major ? 0.012 : 0.004}
            data-bg=""
            pointerEvents="none"
          />
        ))}
        {layers.sun && grid && (
          <g aria-hidden="true" pointerEvents="none">
            {Array.from(grid.hours, (h, i) =>
              Number.isNaN(h) || h <= 0 ? null : (
                <rect
                  key={i}
                  x={grid.x0 + (i % grid.cols) * grid.cellM}
                  y={grid.y0 + Math.floor(i / grid.cols) * grid.cellM}
                  width={grid.cellM}
                  height={grid.cellM}
                  fill="#f2b705"
                  fillOpacity={Math.min(0.7, (h / 12) * 0.7)}
                />
              ),
            )}
          </g>
        )}
        {layers.sun &&
          shadows.map((s, i) => (
            <polygon
              key={i}
              points={pts(s)}
              fill="#000"
              fillOpacity={0.18}
              pointerEvents="none"
              aria-hidden="true"
            />
          ))}
        {[...visible]
          .sort((a, c) => order(a) - order(c))
          .map((it) => {
            const sel = d.selected?.id === it.id;
            const warn = flagged.has(it.id);
            const stroke = sel ? 'var(--pp-accent, #2e7d32)' : warn ? '#d9480f' : '#555';
            const sw = sel || warn ? 0.035 : 0.015;
            const size = it.kind === 'plant' ? sizes(it) : null;
            return (
              <g
                key={it.id}
                tabIndex={0}
                role="button"
                aria-pressed={sel}
                aria-label={m.itemLabel(m.kinds[it.kind], it.label, fmt(it.x), fmt(it.y))}
                onPointerDown={onItemDown(it)}
                onKeyDown={onItemKey(it)}
                onFocus={() => d.select(it.id)}
                className="cursor-move outline-none"
                data-item={it.kind}
              >
                {it.shape === 'line' ? (
                  <>
                    <line x1={it.x} y1={it.y} x2={it.x2} y2={it.y2} stroke="transparent" strokeWidth={0.25} />
                    <line
                      x1={it.x}
                      y1={it.y}
                      x2={it.x2}
                      y2={it.y2}
                      stroke={
                        sel
                          ? stroke
                          : it.kind === 'window'
                            ? '#5c7cfa'
                            : it.kind === 'door'
                              ? '#868e96'
                              : '#333'
                      }
                      strokeWidth={it.kind === 'wall' ? 0.12 : 0.05}
                      strokeDasharray={
                        it.kind === 'railing' || it.kind === 'trellis' ? '0.1 0.06' : undefined
                      }
                    />
                  </>
                ) : it.kind === 'plant' ? (
                  <>
                    {size && (
                      <>
                        <circle
                          cx={it.x}
                          cy={it.y}
                          r={size.rMax}
                          fill="none"
                          stroke="#33691e"
                          strokeOpacity={0.3}
                          strokeWidth={0.01}
                          strokeDasharray="0.04 0.03"
                        />
                        <circle
                          cx={it.x}
                          cy={it.y}
                          r={size.r}
                          fill="#7cb342"
                          fillOpacity={0.35}
                          stroke={stroke}
                          strokeWidth={sw}
                        />
                      </>
                    )}
                    <circle
                      cx={it.x}
                      cy={it.y}
                      r={0.05}
                      fill="#33691e"
                      stroke={sel ? stroke : 'none'}
                      strokeWidth={0.02}
                    />
                  </>
                ) : (
                  <polygon
                    points={pts(footprint(it, 32))}
                    fill={FILL[it.kind] ?? '#ddd'}
                    fillOpacity={it.kind === 'overhang' ? 0.35 : 0.85}
                    stroke={stroke}
                    strokeWidth={sw}
                  />
                )}
                {(it.label || it.kind === 'note') && (
                  <text
                    x={it.x}
                    y={it.y - (it.kind === 'plant' ? 0.08 : 0)}
                    fontSize={font}
                    textAnchor="middle"
                    fill="#222"
                    pointerEvents="none"
                  >
                    {it.label || it.note}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <IconButton label={m.zoomIn} variant="secondary" size="icon-sm" onClick={() => zoom(1.25)}>
          <Plus className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton label={m.zoomOut} variant="secondary" size="icon-sm" onClick={() => zoom(0.8)}>
          <Minus className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton label={m.fit} variant="secondary" size="icon-sm" onClick={() => setView(fit)}>
          <Maximize className="size-4" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}
