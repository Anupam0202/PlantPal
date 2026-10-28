import { z } from 'zod';
import { MONTHS, type SolarClimatology } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { num, provenance } from '../core/provenance';

export const POWER_ENDPOINT = 'https://power.larc.nasa.gov/api/temporal/climatology/point';
const PARAMS = ['ALLSKY_SFC_SW_DWN', 'CLRSKY_SFC_SW_DWN'] as const;

export function solarClimatologyUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    parameters: PARAMS.join(','),
    community: 'AG',
    longitude: String(lon),
    latitude: String(lat),
    format: 'JSON',
  });
  return `${POWER_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  properties: z.object({ parameter: z.record(z.string(), z.record(z.string(), z.unknown())) }),
  header: z
    .object({
      fill_value: z.number().optional(),
      start: z.union([z.string(), z.number()]).optional(),
      end: z.union([z.string(), z.number()]).optional(),
    })
    .optional(),
  parameters: z.record(z.string(), z.object({ units: z.string().optional() })).optional(),
});

/** Converts kWh/m²/day to MJ/m²/day when POWER answers in the RE community's units. */
function toMJ(v: number | null, unit: string | undefined): number | null {
  if (v === null) return null;
  if (!unit || /MJ/i.test(unit)) return v;
  if (/kW-?hr|kWh/i.test(unit)) return Math.round(v * 3.6 * 1000) / 1000;
  return null;
}

export function parseSolarClimatology(
  json: unknown,
  ctx: { lat: number; lon: number; retrievedAt: string; demo?: boolean },
): SolarClimatology {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'nasa-power', 'Unexpected POWER shape');
  const fill = r.data.header?.fill_value ?? -999;
  const clean = (v: unknown) => {
    const n = num(v);
    return n === null || n === fill ? null : n;
  };
  const series = (p: string) => {
    const unit = r.data.parameters?.[p]?.units;
    const row = r.data.properties.parameter[p] ?? {};
    return { months: MONTHS.map((m) => toMJ(clean(row[m]), unit)), ann: toMJ(clean(row.ANN), unit) };
  };
  const all = series('ALLSKY_SFC_SW_DWN');
  const clr = series('CLRSKY_SFC_SW_DWN');
  const start = r.data.header?.start;
  const end = r.data.header?.end;
  return {
    provenance: provenance('nasa-power', {
      retrievedAt: ctx.retrievedAt,
      lat: ctx.lat,
      lon: ctx.lon,
      model: 'MERRA-2 / CERES',
      demo: ctx.demo,
    }),
    period: start && end ? `${String(start).slice(0, 4)}–${String(end).slice(0, 4)}` : null,
    allSkyMJm2Day: all.months,
    clearSkyMJm2Day: clr.months,
    annualAllSkyMJm2Day: all.ann,
  };
}
