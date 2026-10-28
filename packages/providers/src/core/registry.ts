import type { ProviderId } from '@plantpal/schemas';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  licence: string;
  attribution: string;
  sourceUrl: string;
  /** Deadline for one call (forecast 4 s; others 6–8 s). */
  deadlineMs: number;
  /** Fresh for this long; then served stale while revalidating. */
  ttlMs: number;
  /** Stale entries older than this are never served. */
  maxStaleMs: number;
  /** Grid step used to round coordinates before sending them. */
  gridDeg: number | null;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const OPEN_METEO = {
  licence: 'CC BY 4.0 (non-commercial use of the free API)',
  attribution: 'Weather data by Open-Meteo.com',
  sourceUrl: 'https://open-meteo.com/',
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  'open-meteo-forecast': {
    id: 'open-meteo-forecast',
    name: 'Open-Meteo Forecast',
    ...OPEN_METEO,
    deadlineMs: 4000,
    ttlMs: 60 * MIN,
    maxStaleMs: 12 * HOUR,
    gridDeg: 0.05,
  },
  'open-meteo-air': {
    id: 'open-meteo-air',
    name: 'Open-Meteo Air Quality (CAMS)',
    ...OPEN_METEO,
    attribution: 'Air quality by Open-Meteo.com (CAMS)',
    deadlineMs: 6000,
    ttlMs: 60 * MIN,
    maxStaleMs: 6 * HOUR,
    gridDeg: 0.05,
  },
  'open-meteo-elevation': {
    id: 'open-meteo-elevation',
    name: 'Open-Meteo Elevation (90 m DEM)',
    ...OPEN_METEO,
    attribution: 'Elevation by Open-Meteo.com (Copernicus DEM GLO-90)',
    deadlineMs: 6000,
    ttlMs: 365 * DAY,
    maxStaleMs: 730 * DAY,
    gridDeg: 0.01,
  },
  'open-meteo-geocoding': {
    id: 'open-meteo-geocoding',
    name: 'Open-Meteo Geocoding',
    ...OPEN_METEO,
    attribution: 'Place search by Open-Meteo.com (GeoNames)',
    deadlineMs: 6000,
    ttlMs: 30 * DAY,
    maxStaleMs: 90 * DAY,
    gridDeg: null,
  },
  'open-meteo-historical': {
    id: 'open-meteo-historical',
    name: 'Open-Meteo Historical (reanalysis)',
    ...OPEN_METEO,
    attribution: 'Historical weather by Open-Meteo.com (ERA5 reanalysis)',
    deadlineMs: 8000,
    ttlMs: 365 * DAY,
    maxStaleMs: 730 * DAY,
    gridDeg: 0.1,
  },
  'open-meteo-climate': {
    id: 'open-meteo-climate',
    name: 'Open-Meteo Climate (CMIP6 HighResMIP)',
    ...OPEN_METEO,
    attribution: 'Climate model data by Open-Meteo.com (CMIP6 HighResMIP)',
    deadlineMs: 8000,
    ttlMs: 365 * DAY,
    maxStaleMs: 730 * DAY,
    gridDeg: 0.1,
  },
  'nasa-power': {
    id: 'nasa-power',
    name: 'NASA POWER',
    licence: 'Public (cite NASA POWER)',
    attribution: 'Solar data from the NASA Langley Research Center POWER Project',
    sourceUrl: 'https://power.larc.nasa.gov/',
    deadlineMs: 8000,
    ttlMs: 365 * DAY,
    maxStaleMs: 730 * DAY,
    gridDeg: 0.1,
  },
  gbif: {
    id: 'gbif',
    name: 'GBIF',
    licence: 'Per dataset (CC0, CC BY); cite datasets',
    attribution: 'Occurrence data via GBIF.org',
    sourceUrl: 'https://www.gbif.org/',
    deadlineMs: 8000,
    ttlMs: 7 * DAY,
    maxStaleMs: 30 * DAY,
    gridDeg: 0.05,
  },
};
