import { z } from 'zod';
import type { Elevation } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { fact, num, provenance } from '../core/provenance';

export const ELEVATION_ENDPOINT = 'https://api.open-meteo.com/v1/elevation';

export function elevationUrl(lat: number, lon: number): string {
  return `${ELEVATION_ENDPOINT}?${new URLSearchParams({ latitude: String(lat), longitude: String(lon) }).toString()}`;
}

const Raw = z.object({ elevation: z.array(z.unknown()) });

export function parseElevation(
  json: unknown,
  ctx: { lat: number; lon: number; retrievedAt: string; demo?: boolean },
): Elevation {
  const r = Raw.safeParse(json);
  if (!r.success)
    throw new ProviderError('BAD_RESPONSE', 'open-meteo-elevation', 'Unexpected elevation shape');
  // Missing or NaN stays unknown — never 0 m (L11).
  const value = num(r.data.elevation[0]);
  return {
    provenance: provenance('open-meteo-elevation', {
      retrievedAt: ctx.retrievedAt,
      lat: ctx.lat,
      lon: ctx.lon,
      model: 'Copernicus DEM GLO-90',
      demo: ctx.demo,
    }),
    elevationM: fact(value, {
      evidence: 'MODELLED',
      method: 'Digital elevation model, 90 m',
      retrievedAt: ctx.retrievedAt,
      unit: 'm',
      provider: 'open-meteo-elevation',
      model: 'Copernicus DEM GLO-90',
      grid: '90 m',
      sourceUrl: 'https://open-meteo.com/en/docs/elevation-api',
      licence: 'CC BY 4.0',
    }),
  };
}
