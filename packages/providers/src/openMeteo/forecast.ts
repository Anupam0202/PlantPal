import { z } from 'zod';
import type { Forecast, NumberFact } from '@plantpal/schemas';
import { ProviderError } from '../core/errors';
import { fact, num, nums, provenance } from '../core/provenance';
import { checkUnits, localToIso, nearestValid } from './common';

export const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

const CURRENT = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
] as const;
const HOURLY = [
  'temperature_2m',
  'precipitation_probability',
  'precipitation',
  'cloud_cover',
  'weather_code',
  'uv_index',
  'et0_fao_evapotranspiration',
  'vapour_pressure_deficit',
  'shortwave_radiation',
  'soil_temperature_6cm',
  'soil_moisture_3_to_9cm',
] as const;
const DAILY = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'sunrise',
  'sunset',
  'daylight_duration',
  'sunshine_duration',
  'uv_index_max',
  'et0_fao_evapotranspiration',
] as const;

const EXPECTED_UNITS: Record<string, string> = {
  temperature_2m: '°C',
  apparent_temperature: '°C',
  precipitation: 'mm',
  wind_speed_10m: 'km/h',
  wind_gusts_10m: 'km/h',
  temperature_2m_max: '°C',
  temperature_2m_min: '°C',
  precipitation_sum: 'mm',
};

export function forecastUrl(lat: number, lon: number, days = 7): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT.join(','),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    timezone: 'auto',
    forecast_days: String(days),
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
  });
  return `${FORECAST_ENDPOINT}?${q.toString()}`;
}

const Raw = z.object({
  latitude: z.number(),
  longitude: z.number(),
  utc_offset_seconds: z.number(),
  timezone: z.string(),
  elevation: z.number().nullable().optional(),
  current: z.record(z.string(), z.unknown()).optional(),
  current_units: z.record(z.string(), z.unknown()).optional(),
  hourly: z.record(z.string(), z.unknown()).optional(),
  hourly_units: z.record(z.string(), z.unknown()).optional(),
  daily: z.record(z.string(), z.unknown()).optional(),
  daily_units: z.record(z.string(), z.unknown()).optional(),
});

const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : '')) : [];
const strsOrNull = (v: unknown): Array<string | null> =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' && x ? x : null)) : [];

/** Normalises an Open-Meteo forecast response into facts with provenance. */
export function parseForecast(
  json: unknown,
  ctx: { lat: number; lon: number; retrievedAt: string; now: number; demo?: boolean },
): Forecast {
  const r = Raw.safeParse(json);
  if (!r.success) throw new ProviderError('BAD_RESPONSE', 'open-meteo-forecast', 'Unexpected forecast shape');
  const raw = r.data;
  const unitProblems = [
    ...checkUnits('forecast', raw.current_units, EXPECTED_UNITS),
    ...checkUnits('forecast', raw.daily_units, EXPECTED_UNITS),
  ];
  if (unitProblems.length > 0)
    throw new ProviderError('BAD_RESPONSE', 'open-meteo-forecast', unitProblems.join('; '));

  const off = raw.utc_offset_seconds;
  const cur = raw.current ?? {};
  const units = (raw.current_units ?? {}) as Record<string, string | undefined>;
  const hourlyUnits = (raw.hourly_units ?? {}) as Record<string, string | undefined>;
  const curTime = typeof cur.time === 'string' ? localToIso(cur.time, off) : ctx.retrievedAt;
  const base = {
    evidence: 'MODELLED' as const,
    method: 'Open-Meteo forecast (best-match model blend)',
    retrievedAt: ctx.retrievedAt,
    provider: 'open-meteo-forecast',
    model: 'best_match',
    grid: '≈0.05° request; model grid 1–25 km',
    sourceUrl: 'https://open-meteo.com/',
    licence: 'CC BY 4.0',
  };
  const c = (key: (typeof CURRENT)[number]): NumberFact =>
    fact(num(cur[key]), { ...base, unit: units[key], phenomenonTime: curTime });

  const h = raw.hourly ?? {};
  const hourTimes = strs(h.time);
  const hourly = (key: (typeof HOURLY)[number]) => nums(h[key]);
  const nearest = (key: (typeof HOURLY)[number]): NumberFact => {
    const n = nearestValid(hourTimes, hourly(key), ctx.now, off);
    return fact(n.value, {
      ...base,
      unit: hourlyUnits[key],
      ...(n.time ? { phenomenonTime: n.time } : {}),
      note: 'Hourly value nearest to now',
    });
  };

  const d = raw.daily ?? {};
  const isDay = num(cur.is_day);

  return {
    provenance: provenance('open-meteo-forecast', {
      retrievedAt: ctx.retrievedAt,
      lat: ctx.lat,
      lon: ctx.lon,
      model: 'best_match',
      demo: ctx.demo,
    }),
    timezone: raw.timezone,
    utcOffsetSeconds: off,
    elevationM: num(raw.elevation),
    current: {
      time: curTime,
      temperatureC: c('temperature_2m'),
      apparentTemperatureC: c('apparent_temperature'),
      humidityPct: c('relative_humidity_2m'),
      precipitationMm: c('precipitation'),
      weatherCode: c('weather_code'),
      cloudCoverPct: c('cloud_cover'),
      windSpeedKmh: c('wind_speed_10m'),
      windGustsKmh: c('wind_gusts_10m'),
      windDirectionDeg: c('wind_direction_10m'),
      isDay: isDay === null ? null : isDay === 1,
      uvIndex: nearest('uv_index'),
      soilTemperature6cmC: nearest('soil_temperature_6cm'),
      soilMoisture3to9cm: nearest('soil_moisture_3_to_9cm'),
    },
    hourly: {
      time: hourTimes.map((t) => localToIso(t, off)),
      temperatureC: hourly('temperature_2m'),
      precipitationProbabilityPct: hourly('precipitation_probability'),
      precipitationMm: hourly('precipitation'),
      cloudCoverPct: hourly('cloud_cover'),
      weatherCode: hourly('weather_code'),
      uvIndex: hourly('uv_index'),
      et0Mm: hourly('et0_fao_evapotranspiration'),
      vpdKpa: hourly('vapour_pressure_deficit'),
      shortwaveRadiationWm2: hourly('shortwave_radiation'),
    },
    daily: {
      date: strs(d.time),
      temperatureMaxC: nums(d.temperature_2m_max),
      temperatureMinC: nums(d.temperature_2m_min),
      precipitationSumMm: nums(d.precipitation_sum),
      precipitationProbabilityMaxPct: nums(d.precipitation_probability_max),
      weatherCode: nums(d.weather_code),
      sunrise: strsOrNull(d.sunrise).map((s) => (s ? localToIso(s, off) : null)),
      sunset: strsOrNull(d.sunset).map((s) => (s ? localToIso(s, off) : null)),
      daylightDurationS: nums(d.daylight_duration),
      sunshineDurationS: nums(d.sunshine_duration),
      uvIndexMax: nums(d.uv_index_max),
      et0SumMm: nums(d.et0_fao_evapotranspiration),
    },
  };
}
