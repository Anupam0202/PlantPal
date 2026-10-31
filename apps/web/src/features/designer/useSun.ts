import {
  dueInstant,
  shadowPolygons,
  sunPosition,
  type Horizon,
  type Poly,
  type SunGrid,
} from '@plantpal/domain';
import type { LayoutBody } from '@plantpal/schemas';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface SunSettings {
  month: number;
  hour: number;
  heatmap: boolean;
}

/**
 * Shadows for the chosen hour (cheap, main thread) and the day's direct-sun grid (Web Worker). The
 * grid is recomputed only when the geometry, place or day changes.
 */
export function useSun(
  body: LayoutBody,
  place: { lat: number; lon: number; timeZone: string } | null,
  horizon: Horizon | null,
  s: SunSettings,
): { grid: SunGrid | null; shadows: Poly[]; computing: boolean; date: string | null } {
  const year = new Date().getFullYear();
  const date = place ? `${year}-${String(s.month + 1).padStart(2, '0')}-21` : null;
  const shadows = useMemo(() => {
    if (!place || !date) return [];
    const t = dueInstant(
      date,
      `${String(Math.floor(s.hour)).padStart(2, '0')}:${String(Math.round((s.hour % 1) * 60)).padStart(2, '0')}`,
      place.timeZone,
    );
    const { azimuth, elevation } = sunPosition(t, place.lat, place.lon);
    return elevation > 0 ? shadowPolygons(body, azimuth, elevation) : [];
  }, [body, place, date, s.hour]);

  const [grid, setGrid] = useState<SunGrid | null>(null);
  const [computing, setComputing] = useState(false);
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  // Geometry that matters for shade: outline, frame and solid items (plants and notes do not cast shade).
  const shadeKey = JSON.stringify([body.outline, body.frame, body.items.filter((i) => i.solid)]);

  useEffect(() => {
    if (!s.heatmap || !place || !date) return;
    worker.current ??= new Worker(new URL('./sun.worker.ts', import.meta.url), { type: 'module' });
    const w = worker.current;
    const id = ++seq.current;
    const area = (() => {
      const xs = body.outline.map((p) => p[0]);
      const ys = body.outline.map((p) => p[1]);
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    })();
    const cellM = Math.max(0.1, Math.round(Math.sqrt(area / 4000) * 10) / 10);
    setComputing(true);
    const onMsg = (e: MessageEvent<{ id: number; grid?: SunGrid; error?: string }>) => {
      if (e.data.id !== id) return;
      setComputing(false);
      if (e.data.grid) setGrid(e.data.grid);
    };
    w.addEventListener('message', onMsg);
    w.postMessage({
      id,
      body,
      opts: { lat: place.lat, lon: place.lon, timeZone: place.timeZone, date, horizon, cellM, stepMin: 10 },
    });
    return () => w.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the shade geometry
  }, [shadeKey, place?.lat, place?.lon, place?.timeZone, date, s.heatmap, horizon]);

  useEffect(() => () => worker.current?.terminate(), []);
  return { grid: s.heatmap ? grid : null, shadows, computing, date };
}
