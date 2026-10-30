import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibre, NavigationControl, setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { HexFeatureCollection, LonLat } from './geo';

/** OpenFreeMap needs no key; the style URL stays configurable because the public instance is as-is. */
const STYLE_URL = String(
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
);

setWorkerUrl(workerUrl);

export interface MapViewProps {
  /** Accessible name of the map region. */
  label: string;
  center: LonLat;
  zoom: number;
  hexes: HexFeatureCollection;
  /** Value at which a hexagon is fully coloured. */
  maxValue: number;
  /** A point drawn on the map: only on private pages (the person's own garden). */
  point?: LonLat | null;
  /** Shown when the basemap could not load; hexagons still draw. */
  basemapMissing: string;
  onFail?: () => void;
}

/** A design token as an sRGB colour MapLibre understands (tokens may be oklch). */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** The remote style, or a plain background when it cannot be reached (offline, blocked, down). */
async function loadStyle(): Promise<{ style: StyleSpecification | string; basemap: boolean }> {
  try {
    const res = await fetch(STYLE_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(String(res.status));
    return { style: (await res.json()) as StyleSpecification, basemap: true };
  } catch {
    return {
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': token('--color-sunken', '#eee') },
          },
        ],
      },
      basemap: false,
    };
  }
}

export default function MapView({
  label,
  center,
  zoom,
  hexes,
  maxValue,
  point,
  basemapMissing,
  onFail,
}: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const [basemap, setBasemap] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadStyle().then(({ style, basemap: ok }) => {
      if (cancelled || !box.current) return;
      setBasemap(ok);
      try {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const m = new MapLibre({
          container: box.current,
          style,
          center,
          zoom,
          // MapLibre's attribution control parses HTML, which Trusted Types blocks; the attribution is
          // shown as text under the map instead.
          attributionControl: false,
          fadeDuration: reduced ? 0 : 300,
          cooperativeGestures: false,
        });
        map.current = m;
        m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
        m.on('error', () => undefined); // Missing tiles are not fatal: the hexagons still draw.
        m.on('load', () => {
          const accent = token('--color-accent', '#2f7d4f');
          const ink = token('--color-ink', '#1d2a22');
          m.addSource('hexes', { type: 'geojson', data: hexes });
          m.addLayer({
            id: 'hex-fill',
            type: 'fill',
            source: 'hexes',
            paint: {
              'fill-color': accent,
              'fill-opacity': [
                'interpolate',
                ['linear'],
                ['get', 'value'],
                0,
                0.04,
                Math.max(maxValue, 0.01),
                0.7,
              ],
            },
          });
          m.addLayer({
            id: 'hex-line',
            type: 'line',
            source: 'hexes',
            paint: { 'line-color': accent, 'line-width': 1, 'line-opacity': 0.6 },
          });
          if (point) {
            m.addSource('point', { type: 'geojson', data: { type: 'Point', coordinates: point } });
            m.addLayer({
              id: 'point',
              type: 'circle',
              source: 'point',
              paint: {
                'circle-radius': 7,
                'circle-color': ink,
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
              },
            });
          }
          box.current?.setAttribute('data-map-ready', 'true');
        });
      } catch {
        // No WebGL (or a blocked context): the page keeps its list alternative.
        onFail?.();
      }
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once per mount; parents remount it with a key when the data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={box}
        role="region"
        aria-label={label}
        className="h-80 w-full overflow-hidden rounded-lg border border-line bg-sunken sm:h-96"
        data-testid="map"
      />
      <p className="text-caption text-muted">
        {basemap ? '© OpenFreeMap · © OpenMapTiles · ' : ''}© OpenStreetMap contributors
      </p>
      {!basemap && <p className="text-caption text-muted">{basemapMissing}</p>}
    </div>
  );
}
