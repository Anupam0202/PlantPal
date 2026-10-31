import {
  HORIZON_BINS,
  HORIZON_BIN_DEG,
  isDirectSun,
  lightClass,
  startOfLocalDay,
  sunPosition,
  type LightClass,
  type SunSpot,
} from '@plantpal/domain';
import { useMemo } from 'react';
import { usePrefs } from '../../state/prefs';
import { monthName } from '../plan/engine';
import { usePlanT } from '../plan/messages';

const SIZE = 280;
const R = 120;
const C = SIZE / 2;

/** Polar sky projection: zenith in the centre, horizon on the rim, north up, east to the right. */
function project(azimuth: number, elevation: number): [number, number] {
  const r = R * (1 - Math.max(0, Math.min(90, elevation)) / 90);
  const a = (azimuth * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

const pt = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;

function horizonPath(horizon: readonly number[]): string {
  const inner: string[] = [];
  for (let i = 0; i < HORIZON_BINS; i++) {
    const h = horizon[i] ?? 0;
    inner.push(pt(project(i * HORIZON_BIN_DEG, h)), pt(project((i + 1) * HORIZON_BIN_DEG, h)));
  }
  const outer: string[] = [];
  for (let az = 360; az >= 0; az -= 5) outer.push(pt(project(az, 0)));
  return `M${inner.join(' L')} L${outer.join(' L')} Z`;
}

function overhangPath(o: NonNullable<SunSpot['overhang']>): string {
  const pts: string[] = [];
  for (let g = -89; g <= 89; g += 2) {
    const e =
      (Math.atan(Math.tan((o.cutoffDeg * Math.PI) / 180) * Math.cos((g * Math.PI) / 180)) * 180) / Math.PI;
    pts.push(pt(project(o.facingDeg + g, e)));
  }
  return `M${pts.join(' L')} Z`;
}

interface Arc {
  key: string;
  all: string[];
  direct: string[][];
}

function arcFor(spot: SunSpot, date: string, key: string): Arc {
  const start = startOfLocalDay(date, spot.timeZone);
  const all: string[] = [];
  const direct: string[][] = [];
  let run: string[] | null = null;
  for (let t = start; t < start + 86_400_000; t += 10 * 60_000) {
    const p = sunPosition(t, spot.lat, spot.lon);
    if (p.elevation <= 0) {
      run = null;
      continue;
    }
    const xy = pt(project(p.azimuth, p.elevation));
    all.push(xy);
    if (isDirectSun(spot, t)) {
      if (!run) {
        run = [];
        direct.push(run);
      }
      run.push(xy);
    } else run = null;
  }
  return { key, all, direct };
}

const ARC_STYLE: Record<string, string> = {
  summer: 'stroke-pollen-700',
  equinox: 'stroke-accent',
  winter: 'stroke-dusk',
};

/** Sun Path Dome (§6.2): monthly sun arcs over the obstruction silhouette, blocked parts faded. */
export function SunPathDome({ spot, year, summary }: { spot: SunSpot; year: number; summary: string }) {
  const m = usePlanT();
  const arcs = useMemo(
    () => [
      arcFor(spot, `${year}-06-21`, 'summer'),
      arcFor(spot, `${year}-03-21`, 'equinox'),
      arcFor(spot, `${year}-12-21`, 'winter'),
    ],
    [spot, year],
  );
  const labels: Record<string, string> = {
    summer: m.sun.legendSummer,
    equinox: m.sun.legendEquinox,
    winter: m.sun.legendWinter,
  };
  return (
    <figure className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={m.sun.domeLabel(summary)}
        className="w-full max-w-xs"
      >
        <circle cx={C} cy={C} r={R} className="fill-info-soft stroke-line" strokeWidth={1} />
        {[30, 60].map((e) => (
          <circle
            key={e}
            cx={C}
            cy={C}
            r={R * (1 - e / 90)}
            className="fill-none stroke-line"
            strokeDasharray="2 3"
            strokeWidth={0.75}
          />
        ))}
        <path
          d={horizonPath(spot.horizon)}
          className="fill-clay-soft stroke-clay"
          strokeWidth={0.75}
          fillRule="evenodd"
        />
        {spot.overhang && (
          <path
            d={overhangPath(spot.overhang)}
            className="fill-clay-soft stroke-clay"
            strokeWidth={0.75}
            opacity={0.8}
          />
        )}
        {arcs.map((a) => (
          <g key={a.key}>
            <polyline
              points={a.all.join(' ')}
              className={`fill-none ${ARC_STYLE[a.key]}`}
              strokeWidth={1.25}
              strokeDasharray="3 3"
              opacity={0.55}
            />
            {a.direct.map((run, i) => (
              <polyline
                key={i}
                points={run.join(' ')}
                className={`fill-none ${ARC_STYLE[a.key]}`}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ))}
          </g>
        ))}
        {(
          [
            ['N', 0],
            ['E', 90],
            ['S', 180],
            ['W', 270],
          ] as const
        ).map(([l, az]) => {
          const [x, y] = project(az, -12);
          return (
            <text
              key={l}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted text-[11px] font-semibold"
            >
              {l}
            </text>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-caption text-muted">
        {arcs.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="18"
                y2="3"
                className={ARC_STYLE[a.key]}
                strokeWidth={3}
                strokeLinecap="round"
              />
            </svg>
            {labels[a.key]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-clay-soft ring-1 ring-clay" aria-hidden="true" />
          {m.sun.legendBlocked}
        </span>
      </figcaption>
    </figure>
  );
}

const CLASS_TONE: Record<LightClass, string> = {
  'full-sun': 'bg-pollen-400',
  'part-sun': 'bg-pollen-300',
  'part-shade': 'bg-accent-soft',
  shade: 'bg-line-strong',
};

/** Twelve monthly bars plus the same numbers as a table (accessible equivalent). */
export function MonthlyBars({ hours }: { hours: readonly number[] }) {
  const m = usePlanT();
  const locale = usePrefs((s) => s.locale);
  const max = Math.max(8, ...hours);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-36 items-end gap-1" aria-hidden="true">
        {hours.map((h, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular text-[10px] text-muted">{h.toFixed(1)}</span>
            <div
              className={`w-full rounded-t-sm ${CLASS_TONE[lightClass(h)]}`}
              style={{ height: `${Math.max(2, (h / max) * 100)}px` }}
            />
            <span className="text-[10px] text-subtle">{monthName(i, locale).slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <details className="text-body-s">
        <summary className="cursor-pointer text-muted">{m.sun.monthly}</summary>
        <table className="mt-2 w-full text-left text-body-s">
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-medium">
                {m.sun.month}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {m.sun.hours}
              </th>
              <th scope="col" className="py-1 pl-3 font-medium">
                {m.sun.lightClass}
              </th>
            </tr>
          </thead>
          <tbody>
            {hours.map((h, i) => (
              <tr key={i} className="border-t border-line">
                <th scope="row" className="py-1 font-normal">
                  {monthName(i, locale)}
                </th>
                <td className="tabular py-1 text-right">{h.toFixed(1)}</td>
                <td className="py-1 pl-3">{m.sun.classes[lightClass(h)]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
