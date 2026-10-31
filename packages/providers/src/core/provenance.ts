import type { NumberFact, Provenance, ProviderId } from '@plantpal/schemas';
import { PROVIDERS } from './registry';

export function provenance(
  id: ProviderId,
  opts: {
    retrievedAt: string;
    lat: number | null;
    lon: number | null;
    model?: string | null;
    demo?: boolean;
  },
): Provenance {
  const p = PROVIDERS[id];
  return {
    provider: id,
    retrievedAt: opts.retrievedAt,
    lat: opts.lat,
    lon: opts.lon,
    grid: p.gridDeg ? `≈${p.gridDeg}°` : null,
    model: opts.model ?? null,
    licence: p.licence,
    attribution: p.attribution,
    sourceUrl: p.sourceUrl,
    stale: false,
    demo: opts.demo ?? false,
  };
}

/** A finite number or `null` — never a default of 0 (S2, L11). */
export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function nums(v: unknown): Array<number | null> {
  return Array.isArray(v) ? v.map(num) : [];
}

export function fact(
  value: number | null,
  base: Pick<NumberFact, 'evidence' | 'method' | 'retrievedAt'> & Partial<NumberFact>,
): NumberFact {
  return { stale: false, ...base, value };
}
