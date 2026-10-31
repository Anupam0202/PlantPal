import { z } from 'zod';
import { Evidence } from './primitives';

/**
 * A provider value with provenance (§13.3). `value: null` means unknown — never zero (S2).
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
  'wikimedia-commons',
  'wikidata',
  'inaturalist',
  'overpass',
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
    /** Hourly-only variables, taken at the nearest valid hour. */
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
  /** By month, January first: 90th percentile of daily maximum, 10th percentile of daily minimum. */
  tmaxP90ByMonth: z.array(nn).nullable().default(null),
  tminP10ByMonth: z.array(nn).nullable().default(null),
  method: z.string(),
});
export type ClimateProfile = z.infer<typeof ClimateProfile>;

const Range3 = z.object({ min: z.number(), median: z.number(), max: z.number() }).nullable();

/**
 * Climate model change for a place (§6.15): each model against its own baseline, as a multi-model
 * range. HighResMIP runs follow one forcing pathway; no scenario is selectable or named.
 */
export const ClimateProjection = z.object({
  provenance: Provenance,
  baseline: z.string(),
  future: z.string(),
  models: z.array(z.string()),
  perModel: z.array(z.object({ model: z.string(), dTmeanC: z.number(), dPrecipPct: z.number().nullable() })),
  dTmeanC: Range3,
  dPrecipPct: Range3,
  note: z.string(),
});
export type ClimateProjection = z.infer<typeof ClimateProjection>;

/** A name resolved against the GBIF backbone (F5 candidates and species intake). */
export const SpeciesMatch = z.object({
  provenance: Provenance,
  query: z.string(),
  /** True only for an exact or fuzzy match at species rank or below with confidence ≥ 80. */
  resolved: z.boolean(),
  usageKey: z.number().int().nullable(),
  /** The accepted name's key when the match is a synonym. */
  acceptedKey: z.number().int().nullable(),
  scientificName: z.string().nullable(),
  canonicalName: z.string().nullable(),
  rank: z.string().nullable(),
  status: z.string().nullable(),
  matchType: z.string(),
  confidence: z.number().nullable(),
  family: z.string().nullable(),
});
export type SpeciesMatch = z.infer<typeof SpeciesMatch>;

/** Openly licensed photos from Wikimedia Commons, each with its own licence and author. */
export const SpeciesMedia = z.object({
  provenance: Provenance,
  items: z.array(
    z.object({
      title: z.string(),
      thumbUrl: z.string().url(),
      pageUrl: z.string().url(),
      licence: z.string(),
      licenceUrl: z.string().nullable(),
      author: z.string(),
    }),
  ),
});
export type SpeciesMedia = z.infer<typeof SpeciesMedia>;

/** Common names from Wikidata (CC0), found through the GBIF taxon id (P846). */
export const SpeciesNames = z.object({
  provenance: Provenance,
  wikidataId: z.string().nullable(),
  names: z.object({ en: z.array(z.string()), hi: z.array(z.string()), es: z.array(z.string()) }),
});
export type SpeciesNames = z.infer<typeof SpeciesNames>;

/** Neighbourhood nature (§6.10, P2). Groups map to iNaturalist iconic taxa. */
export const NEARBY_GROUPS = ['insects', 'birds', 'plants'] as const;
export type NearbyGroup = (typeof NEARBY_GROUPS)[number];

/** Species observed near the garden. Counts are observations, which reflect where people looked. */
export const NearbySpecies = z.object({
  provenance: Provenance,
  group: z.enum(NEARBY_GROUPS),
  radiusKm: z.number().positive(),
  /** Distinct species with research-grade observations in the radius. */
  totalTaxa: z.number().int().nonnegative(),
  species: z.array(
    z.object({
      taxonId: z.number().int(),
      name: z.string(),
      commonName: z.string().nullable(),
      observations: z.number().int().nonnegative(),
    }),
  ),
});
export type NearbySpecies = z.infer<typeof NearbySpecies>;

/** GBIF occurrence records near the garden, open licences only. Records are not individuals or species. */
export const NearbyRecords = z.object({
  provenance: Provenance,
  kingdom: z.enum(['plants', 'animals', 'fungi']),
  radiusKm: z.number().positive(),
  records: z.number().int().nonnegative(),
  taxa: z.number().int().nonnegative(),
  taxaCapped: z.boolean(),
  licences: z.array(z.string()),
});
export type NearbyRecords = z.infer<typeof NearbyRecords>;

// ---------------------------------------------------------------- green space (corridor map, §6.16)

export const GREEN_KINDS = [
  'park',
  'wood',
  'meadow',
  'allotment',
  'cemetery',
  'garden',
  'green-roof',
] as const;
export type GreenKind = (typeof GREEN_KINDS)[number];

/** A ring of [lon, lat] pairs, first point repeated last. */
const Ring = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4);

/**
 * Mapped green space from OpenStreetMap around one coarse tile (H3 resolution 7). This is mapped land
 * cover, not habitat quality, and OpenStreetMap completeness varies by place.
 */
export const GreenSpace = z.object({
  provenance: Provenance,
  /** The coarse tile asked about; no garden coordinates are sent. */
  tile: z.string(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  areas: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(GREEN_KINDS),
      name: z.string().nullable(),
      /** Outer rings only; holes are ignored (shares are approximate). */
      rings: z.array(Ring).min(1),
    }),
  ),
  /** Some areas were left out to keep the response small (largest kept first). */
  truncated: z.boolean(),
});
export type GreenSpace = z.infer<typeof GreenSpace>;
