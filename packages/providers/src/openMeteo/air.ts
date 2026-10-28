import { z } from 'zod';
import { POLLEN_TYPES, type AirQuality, type NumberFact } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { fact, num, provenance } from '../core/provenance';
import { localToIso } from './common';

export const AIR_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CURRENT = [
  'us_aqi',
  'european_aqi',
  'pm2_5',
  'pm10',
  'ozone',
  'nitrogen_dioxide',
  ...POLLEN_TYPES.map((p) => `${p}_pollen`),
];

export function airUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT.join(','),
    timezone: 'auto',
  });
  return `${AIR_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  utc_offset_seconds: z.number(),
  current: z.record(z.string(), z.unknown()),
  current_units: z.record(z.string(), z.unknown()).optional(),
});

export function parseAir(
  json: unknown,
  ctx: { lat: number; lon: number; retrievedAt: string; demo?: boolean },
): AirQuality {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'open-meteo-air', 'Unexpected air-quality shape');
  const { current, utc_offset_seconds: off } = r.data;
  const units = (r.data.current_units ?? {}) as Record<string, string | undefined>;
  const time = typeof current.time === 'string' ? localToIso(current.time, off) : ctx.retrievedAt;
  const base = {
    evidence: 'MODELLED' as const,
    method: 'CAMS air-quality model via Open-Meteo',
    retrievedAt: ctx.retrievedAt,
    provider: 'open-meteo-air',
    model: 'CAMS',
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    licence: 'CC BY 4.0',
    phenomenonTime: time,
  };
  const f = (k: string): NumberFact => fact(num(current[k]), { ...base, unit: units[k] });
  const pollen = Object.fromEntries(POLLEN_TYPES.map((p) => [p, f(`${p}_pollen`)])) as AirQuality['pollen'];
  // CAMS pollen is Europe-only: elsewhere every pollen value comes back null.
  const pollenCovered = POLLEN_TYPES.some((p) => pollen[p].value !== null);
  return {
    provenance: provenance('open-meteo-air', {
      retrievedAt: ctx.retrievedAt,
      lat: ctx.lat,
      lon: ctx.lon,
      model: 'CAMS',
      demo: ctx.demo,
    }),
    time,
    usAqi: f('us_aqi'),
    europeanAqi: f('european_aqi'),
    pm25: f('pm2_5'),
    pm10: f('pm10'),
    ozone: f('ozone'),
    nitrogenDioxide: f('nitrogen_dioxide'),
    pollenCovered,
    pollen,
  };
}
