import { z } from 'zod';
import type { DailySeries, ModelSeries } from '@plantpal/domain';
import { CLIMATE_API_RANGE } from '@plantpal/domain';
import { ProviderError } from '../core/errors';
import { nums } from '../core/provenance';

export const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
export const CLIMATE_ENDPOINT = 'https://climate-api.open-meteo.com/v1/climate';
const DAILY = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'] as const;

/** CMIP6 HighResMIP models offered by the Open-Meteo Climate API (verify the list at build time). */
export const CLIMATE_MODELS = [
  'CMCC_CM2_VHR4',
  'FGOALS_f3_H',
  'HiRAM_SIT_HR',
  'MRI_AGCM3_2_S',
  'EC_Earth3P_HR',
  'MPI_ESM1_2_XR',
  'NICAM16_8S',
] as const;

export function archiveUrl(lat: number, lon: number, startYear = 1991, endYear = 2020): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${startYear}-01-01`,
    end_date: `${endYear}-12-31`,
    daily: DAILY.join(','),
    timezone: 'auto',
  });
  return `${ARCHIVE_ENDPOINT}?${q.toString()}`;
}

/** The Climate API covers 1950–2050 and has no scenario parameter (L08); other years are refused here. */
export function climateUrl(
  lat: number,
  lon: number,
  startYear = 1991,
  endYear = 2050,
  models: readonly string[] = CLIMATE_MODELS,
): string {
  if (startYear < CLIMATE_API_RANGE.first || endYear > CLIMATE_API_RANGE.last || startYear > endYear) {
    throw new RangeError(
      `Climate model data covers ${CLIMATE_API_RANGE.first}–${CLIMATE_API_RANGE.last} only`,
    );
  }
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: `${startYear}-01-01`,
    end_date: `${endYear}-12-31`,
    models: models.join(','),
    daily: DAILY.join(','),
  });
  return `${CLIMATE_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  daily: z.record(z.string(), z.unknown()),
  daily_units: z.record(z.string(), z.unknown()).optional(),
});

function checkUnits(provider: string, units: Record<string, unknown> | undefined) {
  for (const [k, u] of Object.entries(units ?? {})) {
    if (k.startsWith('temperature') && u !== '°C')
      throw new ProviderError('BAD_RESPONSE', provider, `${k} in ${String(u)}`);
    if (k.startsWith('precipitation') && u !== 'mm')
      throw new ProviderError('BAD_RESPONSE', provider, `${k} in ${String(u)}`);
  }
}

export function parseArchive(json: unknown): DailySeries {
  const r = Raw.safeParse(json);
  if (!r.success)
    throw new ProviderError('BAD_RESPONSE', 'open-meteo-historical', 'Unexpected archive shape');
  checkUnits('open-meteo-historical', r.data.daily_units);
  const d = r.data.daily;
  const dates = Array.isArray(d.time) ? d.time.map(String) : [];
  return {
    dates,
    tmax: nums(d.temperature_2m_max),
    tmin: nums(d.temperature_2m_min),
    precip: nums(d.precipitation_sum),
  };
}

/** Splits the multi-model response (`temperature_2m_max_<MODEL>` …) into one series per model. */
export function parseClimate(json: unknown, models: readonly string[] = CLIMATE_MODELS): ModelSeries[] {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'open-meteo-climate', 'Unexpected climate shape');
  checkUnits('open-meteo-climate', r.data.daily_units);
  const d = r.data.daily;
  const dates = Array.isArray(d.time) ? d.time.map(String) : [];
  return models.flatMap((m) => {
    const tmax = d[`temperature_2m_max_${m}`];
    if (!Array.isArray(tmax)) return [];
    return [
      {
        model: m,
        series: {
          dates,
          tmax: nums(tmax),
          tmin: nums(d[`temperature_2m_min_${m}`]),
          precip: nums(d[`precipitation_sum_${m}`]),
        },
      },
    ];
  });
}
