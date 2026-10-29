import { z } from 'zod';
import { Evidence } from './primitives';

/**
 * A provider value with provenance (master prompt §13.3). `value: null` means unknown — never zero (S2).
 * Times are ISO 8601 strings; `phenomenonTime` is when the value applies, `retrievedAt` when we fetched it.
 */
export const Fact = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    unit: z.string().optional(),
    evidence: Evidence,
    method: z.string(),
    phenomenonTime: z.string().optional(),
    issuedAt: z.string().optional(),
    retrievedAt: z.string(),
    provider: z.string().optional(),
    model: z.string().optional(),
    grid: z.string().optional(),
    sourceUrl: z.string().optional(),
    licence: z.string().optional(),
    stale: z.boolean(),
    note: z.string().optional(),
  });
export const NumberFact = Fact(z.number());
export type NumberFact = z.infer<typeof NumberFact>;

export const PROVIDER_IDS = [
  'open-meteo-forecast',
  'open-meteo-air',
  'open-meteo-elevation',
  'open-meteo-geocoding',
  'open-meteo-historical',
  'open-meteo-climate',
  'nasa-power',
  'gbif',
] as const;
export const ProviderId = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderId>;

/** Common envelope for a provider response delivered to the app. */
export const Provenance = z.object({
  provider: ProviderId,
  retrievedAt: z.string(),
  /** Coordinates actually sent to the provider (rounded for privacy). */
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  grid: z.string().nullable(),
  model: z.string().nullable(),
  licence: z.string(),
  attribution: z.string(),
  sourceUrl: z.string(),
  /** `true` when served from cache past its freshness window (stale-while-revalidate). */
  stale: z.boolean(),
  /** `true` when this is recorded demo data, not a live response. */
  demo: z.boolean(),
});
export type Provenance = z.infer<typeof Provenance>;

const nums = z.array(z.number().nullable());

export const Forecast = z.object({
  provenance: Provenance,
  timezone: z.string(),
  utcOffsetSeconds: z.number(),
  elevationM: z.number().nullable(),
  current: z.object({
    time: z.string(),
    temperatureC: NumberFact,
    apparentTemperatureC: NumberFact,
    humidityPct: NumberFact,
    precipitationMm: NumberFact,
    weatherCode: NumberFact,
    cloudCoverPct: NumberFact,
    windSpeedKmh: NumberFact,
    windGustsKmh: NumberFact,
    windDirectionDeg: NumberFact,
    isDay: z.boolean().nullable(),
    /** Hourly-only variables, taken at the nearest valid hour (L11). */
    uvIndex: NumberFact,
    soilTemperature6cmC: NumberFact,
    soilMoisture3to9cm: NumberFact,
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperatureC: nums,
    precipitationProbabilityPct: nums,
    precipitationMm: nums,
    cloudCoverPct: nums,
    weatherCode: nums,
    uvIndex: nums,
    et0Mm: nums,
    vpdKpa: nums,
    shortwaveRadiationWm2: nums,
  }),
  daily: z.object({
    date: z.array(z.string()),
    temperatureMaxC: nums,
    temperatureMinC: nums,
    precipitationSumMm: nums,
    precipitationProbabilityMaxPct: nums,
    weatherCode: nums,
    sunrise: z.array(z.string().nullable()),
    sunset: z.array(z.string().nullable()),
    daylightDurationS: nums,
    sunshineDurationS: nums,
    uvIndexMax: nums,
    et0SumMm: nums,
  }),
});
export type Forecast = z.infer<typeof Forecast>;

export const POLLEN_TYPES = ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed'] as const;

export const AirQuality = z.object({
  provenance: Provenance,
  time: z.string(),
  usAqi: NumberFact,
  europeanAqi: NumberFact,
  pm25: NumberFact,
  pm10: NumberFact,
  ozone: NumberFact,
  nitrogenDioxide: NumberFact,
  /** CAMS pollen covers Europe only; elsewhere this is `false` and the UI says "not covered here". */
  pollenCovered: z.boolean(),
  pollen: z.record(z.enum(POLLEN_TYPES), NumberFact),
});
export type AirQuality = z.infer<typeof AirQuality>;

export const Elevation = z.object({ provenance: Provenance, elevationM: NumberFact });
export type Elevation = z.infer<typeof Elevation>;

export const PlaceResult = z.object({
  id: z.number(),
  name: z.string(),
  admin1: z.string().nullable(),
  country: z.string().nullable(),
  countryCode: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  timezone: z.string().nullable(),
  population: z.number().nullable(),
  elevationM: z.number().nullable(),
});
export type PlaceResult = z.infer<typeof PlaceResult>;

export const PlaceSearch = z.object({ provenance: Provenance, results: z.array(PlaceResult) });
export type PlaceSearch = z.infer<typeof PlaceSearch>;

export const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** NASA POWER long-term monthly climatology for light estimates. */
export const SolarClimatology = z.object({
  provenance: Provenance,
  period: z.string().nullable(),
  /** Monthly means, January first. */
  allSkyMJm2Day: nums,
  clearSkyMJm2Day: nums,
  annualAllSkyMJm2Day: z.number().nullable(),
});
export type SolarClimatology = z.infer<typeof SolarClimatology>;

/** One provider's health for /status and the Sources page. */
export const ProviderStatus = z.object({
  provider: ProviderId,
  enabled: z.boolean(),
  lastSuccessAt: z.string().nullable(),
  lastErrorAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastLatencyMs: z.number().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  circuit: z.enum(['closed', 'open', 'half-open']),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;

/** RFC 9457 problem details with PlantPal's stable codes. */
export const PROBLEM_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'QUOTA_EXHAUSTED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_STALE',
  'CONSENT_REQUIRED',
  'CONFIGURATION_REQUIRED',
  'SNAPSHOT_REQUIRED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
] as const;
export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.enum(PROBLEM_CODES),
  detail: z.string().optional(),
  traceId: z.string(),
  retryAfterSeconds: z.number().optional(),
});
export type Problem = z.infer<typeof Problem>;

const nn = z.number().nullable();

/**
 * Local climate from recent reanalysis (S7): states its period, dataset and resolution. Reanalysis
 * smooths local extremes, so hardiness here is a regional estimate, not a garden measurement.
 */
export const ClimateProfile = z.object({
  provenance: Provenance,
  period: z.string(),
  years: z.number().int(),
  coverage: z.number(),
  extremeMinC: nn,
  hardinessZone: z.string().nullable(),
  frost: z
    .object({
      frostSeasonsPct: z.number(),
      lastSpring: z.object({ p50: z.string(), p90: z.string() }).nullable(),
      firstAutumn: z.object({ p10: z.string(), p50: z.string() }).nullable(),
    })
    .nullable(),
  seasonDays: nn,
  hotDaysPerYear: nn,
  hotSummers: z.boolean().nullable(),
  koppen: z.string().nullable(),
  months: z.array(z.object({ tmeanC: nn, tminC: nn, tmaxC: nn, precipMm: nn })),
  annualMeanC: nn,
  annualPrecipMm: nn,
  method: z.string(),
});
export type ClimateProfile = z.infer<typeof ClimateProfile>;
