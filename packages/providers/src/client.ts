import { climateDeltas, climateSummary } from '@plantpal/domain';
import type {
  GreenSpace,
  NearbyGroup,
  NearbyRecords,
  NearbySpecies,
  SpeciesMatch,
  SpeciesMedia,
  SpeciesNames,
  AirQuality,
  ClimateProfile,
  ClimateProjection,
  Elevation,
  Forecast,
  PlaceSearch,
  ProviderId,
  ProviderStatus,
  SolarClimatology,
} from '@plantpal/schemas';
import type { FactCache } from './core/cache';
import { cacheKey } from './core/cache';
import { CircuitBreaker } from './core/circuit';
import { roundCoords } from './core/coords';
import { ProviderError } from './core/errors';
import { fetchJson } from './core/http';
import { TokenBucket } from './core/limiter';
import { PROVIDERS } from './core/registry';
import {
  commonsFixture,
  gbifNearbyFixtureFor,
  inatSpeciesCountsFixture,
  speciesMatchFixture,
  wikidataLabelsFixture,
  wikidataSearchFixture,
  airFixture,
  dailyFixture,
  elevationFixture,
  forecastFixture,
  geocodingFixture,
  solarFixture,
  overpassGreenFixture,
} from './fixtures';
import { archiveUrl, CLIMATE_MODELS, climateUrl, parseArchive, parseClimate } from './openMeteo/history';
import { airUrl, parseAir } from './openMeteo/air';
import { elevationUrl, parseElevation } from './openMeteo/elevation';
import { forecastUrl, parseForecast } from './openMeteo/forecast';
import { geocodingUrl, parsePlaces } from './openMeteo/geocoding';
import { parseSolarClimatology, solarClimatologyUrl } from './nasaPower/climatology';
import { parseSpeciesMatch, speciesMatchUrl } from './gbif/species';
import { nearbyUrl, parseNearby, type KINGDOMS } from './gbif/occurrences';
import { parseSpeciesCounts, speciesCountsUrl } from './inaturalist/speciesCounts';
import { greenSpaceUrl, parseGreenSpace, type Bbox } from './overpass/greenSpace';
import { provenance } from './core/provenance';
import { commonsUrl, parseCommons } from './wikimedia/commons';
import {
  parseWikidataLabels,
  parseWikidataSearch,
  wikidataLabelsUrl,
  wikidataSearchUrl,
} from './wikimedia/wikidata';

export type ProviderMode = 'live' | 'mock';

export interface StatusEvent {
  provider: ProviderId;
  ok: boolean;
  at: number;
  latencyMs: number | null;
  code: string | null;
}

export interface EnvClientOptions {
  mode: ProviderMode;
  cache: FactCache;
  fetch?: typeof fetch;
  now?: () => number;
  /** Sent only from servers; browsers do not allow setting User-Agent. */
  userAgent?: string;
  /** Kill switches: disabled providers serve cache only. */
  disabled?: readonly ProviderId[];
  onStatus?: (e: StatusEvent) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Per-provider request rates (requests per second, burst). Volunteer-run services get the gentlest limits. */
const RATES: Partial<Record<ProviderId, [number, number]>> = {
  gbif: [1, 2],
  'nasa-power': [0.5, 2],
  'open-meteo-historical': [0.2, 1],
  'open-meteo-climate': [0.2, 1],
  // Overpass asks for slot-based fair use: at most one query every few seconds from this server.
  overpass: [0.2, 1],
};

/** Marks a cached payload (and every fact inside it) as stale. */
export function markStale<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
      if ('stale' in o && ('evidence' in o || 'provider' in o)) o.stale = true;
      return o;
    }
    return v;
  };
  return walk(value) as T;
}

/**
 * Environmental data client used by both the Worker (gateway mode) and the browser (direct mode):
 * rounded coordinates, deadlines, retries, circuit breaker, token bucket, stale-while-revalidate cache
 * that never stores failures, request coalescing, kill switches and status events.
 */
export class EnvClient {
  private readonly circuits = new Map<ProviderId, CircuitBreaker>();
  private readonly buckets = new Map<ProviderId, TokenBucket>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly statuses = new Map<ProviderId, ProviderStatus>();
  private readonly now: () => number;

  constructor(private readonly opts: EnvClientOptions) {
    this.now = opts.now ?? Date.now;
  }

  private circuit(id: ProviderId): CircuitBreaker {
    let c = this.circuits.get(id);
    if (!c) {
      c = new CircuitBreaker(4, 60_000, this.now);
      this.circuits.set(id, c);
    }
    return c;
  }

  private bucket(id: ProviderId): TokenBucket {
    let b = this.buckets.get(id);
    if (!b) {
      const [rate, burst] = RATES[id] ?? [5, 10];
      b = new TokenBucket(burst, rate, this.now);
      this.buckets.set(id, b);
    }
    return b;
  }

  private record(id: ProviderId, ok: boolean, latencyMs: number | null, code: string | null) {
    const at = this.now();
    const prev = this.statuses.get(id);
    const iso = new Date(at).toISOString();
    const c = this.circuit(id);
    this.statuses.set(id, {
      provider: id,
      enabled: !this.opts.disabled?.includes(id),
      lastSuccessAt: ok ? iso : (prev?.lastSuccessAt ?? null),
      lastErrorAt: ok ? (prev?.lastErrorAt ?? null) : iso,
      lastErrorCode: ok ? (prev?.lastErrorCode ?? null) : code,
      lastLatencyMs: latencyMs ?? prev?.lastLatencyMs ?? null,
      consecutiveFailures: c.consecutiveFailures,
      circuit: c.state,
    });
    this.opts.onStatus?.({ provider: id, ok, at, latencyMs, code });
  }

  status(): ProviderStatus[] {
    return (Object.keys(PROVIDERS) as ProviderId[]).map(
      (id) =>
        this.statuses.get(id) ?? {
          provider: id,
          enabled: !this.opts.disabled?.includes(id),
          lastSuccessAt: null,
          lastErrorAt: null,
          lastErrorCode: null,
          lastLatencyMs: null,
          consecutiveFailures: 0,
          circuit: this.circuit(id).state,
        },
    );
  }

  private async get<T>(
    id: ProviderId,
    endpoint: string,
    params: Record<string, string | number | null>,
    /** One URL, or several fetched in order (the parser then receives an array of bodies). */
    url: string | readonly string[],
    fixture: () => unknown,
    parse: (json: unknown, retrievedAt: string, demo: boolean) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    const info = PROVIDERS[id];
    const key = cacheKey(id, endpoint, 'v1', { ...params, mode: this.opts.mode });
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const run = async (): Promise<T> => {
      const now = this.now();
      const cached = await this.opts.cache.get<T>(key);
      if (cached && now < cached.freshUntil) return cached.value;
      const usableStale = cached && now < cached.expiresAt ? markStale(cached.value) : null;

      if (this.opts.disabled?.includes(id)) {
        if (usableStale) return usableStale;
        throw new ProviderError('DISABLED', id, `${info.name} is switched off`);
      }
      const circuit = this.circuit(id);
      if (!circuit.allow()) {
        if (usableStale) return usableStale;
        throw new ProviderError('CIRCUIT_OPEN', id, `${info.name} is failing; trying again later`);
      }
      const wait = this.bucket(id).take();
      if (wait > info.deadlineMs) {
        if (usableStale) return usableStale;
        throw new ProviderError('RATE_LIMITED', id, 'Local rate limit', 429, wait);
      }
      if (wait > 0) await (this.opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms))))(wait);

      try {
        let json: unknown;
        let latencyMs: number;
        if (this.opts.mode === 'mock') {
          json = fixture();
          latencyMs = 0;
        } else {
          const urls = typeof url === 'string' ? [url] : url;
          const bodies: unknown[] = [];
          latencyMs = 0;
          for (const u of urls) {
            const res = await fetchJson(u, {
              provider: id,
              deadlineMs: info.deadlineMs,
              fetch: this.opts.fetch,
              signal,
              now: this.now,
              sleep: this.opts.sleep,
              headers: this.opts.userAgent ? { 'User-Agent': this.opts.userAgent } : undefined,
            });
            bodies.push(res.json);
            latencyMs += res.latencyMs;
          }
          json = typeof url === 'string' ? bodies[0] : bodies;
        }
        const value = parse(json, new Date(this.now()).toISOString(), this.opts.mode === 'mock');
        await this.opts.cache.set(key, {
          value,
          storedAt: this.now(),
          freshUntil: this.now() + info.ttlMs,
          expiresAt: this.now() + info.ttlMs + info.maxStaleMs,
        });
        circuit.success();
        this.record(id, true, latencyMs, null);
        return value;
      } catch (e) {
        const err =
          e instanceof ProviderError
            ? e
            : new ProviderError('NETWORK', id, e instanceof Error ? e.message : 'Error');
        if (err.code !== 'ABORTED') {
          circuit.failure();
          this.record(id, false, null, err.code);
        }
        // Failures are never cached; a still-usable stale copy is better than nothing.
        if (usableStale && err.code !== 'ABORTED') return usableStale;
        throw err;
      }
    };

    const p = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** Resolves a plant name against the GBIF backbone (F5 candidates, species intake). */
  speciesMatch(name: string, signal?: AbortSignal): Promise<SpeciesMatch> {
    const q = name.trim().replace(/\s+/g, ' ').slice(0, 120);
    return this.get(
      'gbif',
      'species-match',
      { q: q.toLowerCase() },
      speciesMatchUrl(q),
      () => speciesMatchFixture(q),
      (json, retrievedAt, demo) => parseSpeciesMatch(json, { query: q, retrievedAt, demo }),
      signal,
    );
  }

  /** Openly licensed photos of a species from Wikimedia Commons. */
  speciesMedia(scientificName: string, signal?: AbortSignal): Promise<SpeciesMedia> {
    const q = scientificName.trim().replace(/\s+/g, ' ').slice(0, 120);
    return this.get(
      'wikimedia-commons',
      'species-media',
      { q: q.toLowerCase() },
      commonsUrl(q),
      () => commonsFixture(q),
      (json, retrievedAt, demo) => parseCommons(json, { retrievedAt, demo }),
      signal,
    );
  }

  /** Common names in English, Hindi and Spanish from Wikidata, found by GBIF taxon id. */
  async speciesNames(gbifKey: number, scientificName: string, signal?: AbortSignal): Promise<SpeciesNames> {
    const found = await this.get(
      'wikidata',
      'search',
      { gbifKey },
      wikidataSearchUrl(gbifKey),
      () => wikidataSearchFixture(gbifKey),
      (json) => ({ qid: parseWikidataSearch(json), retrievedAt: new Date(this.now()).toISOString() }),
      signal,
    );
    const demo = this.opts.mode === 'mock';
    if (!found.qid)
      return parseWikidataLabels(null, { qid: null, scientificName, retrievedAt: found.retrievedAt, demo });
    const qid = found.qid;
    return this.get(
      'wikidata',
      'labels',
      { qid },
      wikidataLabelsUrl(qid),
      () => wikidataLabelsFixture(qid),
      (json, retrievedAt, isDemo) =>
        parseWikidataLabels(json, { qid, scientificName, retrievedAt, demo: isDemo }),
      signal,
    );
  }

  /**
   * Species seen near the garden (iNaturalist, research grade). Only a point rounded to about 5 km
   * and the radius leave the device. Observations reflect where people looked, not abundance.
   */
  nearbySpecies(
    lat: number,
    lon: number,
    radiusKm: number,
    group: NearbyGroup,
    signal?: AbortSignal,
  ): Promise<NearbySpecies> {
    const c = roundCoords(lat, lon, PROVIDERS.inaturalist.gridDeg ?? 0.05);
    const r = Math.min(5, Math.max(1, Math.round(radiusKm)));
    return this.get(
      'inaturalist',
      'species-counts',
      { ...c, r, group },
      speciesCountsUrl(c.lat, c.lon, r, group),
      () => inatSpeciesCountsFixture(group),
      (json, retrievedAt, demo) =>
        parseSpeciesCounts(json, {
          group,
          radiusKm: r,
          provenance: provenance('inaturalist', { retrievedAt, lat: c.lat, lon: c.lon, demo }),
        }),
      signal,
    );
  }

  /**
   * Mapped green space (OpenStreetMap via Overpass) around one coarse tile. Server-side only: browsers
   * call the Worker, which caches per tile for 90 days. Only the tile's bounding box is sent.
   */
  greenSpace(tile: string, bbox: Bbox, signal?: AbortSignal): Promise<GreenSpace> {
    const box = bbox.map((v) => Math.round(v * 1e4) / 1e4) as Bbox;
    return this.get(
      'overpass',
      'green-space',
      { tile },
      greenSpaceUrl(box),
      () => overpassGreenFixture(box),
      (json, retrievedAt, demo) =>
        parseGreenSpace(json, {
          tile,
          bbox: box,
          provenance: provenance('overpass', { retrievedAt, lat: null, lon: null, demo }),
        }),
      signal,
    );
  }

  /** GBIF occurrence records near the garden (CC0 and CC BY only): records and distinct species. */
  nearbyRecords(
    lat: number,
    lon: number,
    radiusKm: number,
    kingdom: keyof typeof KINGDOMS,
    signal?: AbortSignal,
  ): Promise<NearbyRecords> {
    const c = roundCoords(lat, lon, PROVIDERS.gbif.gridDeg ?? 0.05);
    const r = Math.min(5, Math.max(1, Math.round(radiusKm)));
    return this.get(
      'gbif',
      'nearby',
      { ...c, r, kingdom },
      nearbyUrl(c.lat, c.lon, r, kingdom),
      () => gbifNearbyFixtureFor(kingdom),
      (json, retrievedAt, demo) => {
        const n = parseNearby(json, { radiusKm: r, kingdom });
        return {
          provenance: provenance('gbif', { retrievedAt, lat: c.lat, lon: c.lon, demo }),
          kingdom,
          radiusKm: r,
          records: n.records,
          taxa: n.taxa,
          taxaCapped: n.taxaCapped,
          licences: [...n.licences],
        };
      },
      signal,
    );
  }

  forecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
    const c = roundCoords(lat, lon, PROVIDERS['open-meteo-forecast'].gridDeg ?? 0.05);
    return this.get(
      'open-meteo-forecast',
      'forecast',
      c,
      forecastUrl(c.lat, c.lon),
      () => forecastFixture({ lat: c.lat, lon: c.lon }),
      (json, retrievedAt, demo) =>
        parseForecast(json, {
          ...c,
          retrievedAt,
          demo,
          // Demo data is anchored to its own "current" hour.
          now: demo ? Date.parse('2026-10-28T14:15:00+05:30') : this.now(),
        }),
      signal,
    );
  }

  air(lat: number, lon: number, signal?: AbortSignal): Promise<AirQuality> {
    const c = roundCoords(lat, lon, PROVIDERS['open-meteo-air'].gridDeg ?? 0.05);
    return this.get(
      'open-meteo-air',
      'air-quality',
      c,
      airUrl(c.lat, c.lon),
      () => airFixture({ europe: c.lat > 35 && c.lon > -25 && c.lon < 45 }),
      (json, retrievedAt, demo) => parseAir(json, { ...c, retrievedAt, demo }),
      signal,
    );
  }

  elevation(lat: number, lon: number, signal?: AbortSignal): Promise<Elevation> {
    const c = roundCoords(lat, lon, PROVIDERS['open-meteo-elevation'].gridDeg ?? 0.01);
    return this.get(
      'open-meteo-elevation',
      'elevation',
      c,
      elevationUrl(c.lat, c.lon),
      () => elevationFixture(),
      (json, retrievedAt, demo) => parseElevation(json, { ...c, retrievedAt, demo }),
      signal,
    );
  }

  searchPlaces(query: string, language: string, signal?: AbortSignal): Promise<PlaceSearch> {
    const q = query.trim().toLowerCase();
    return this.get(
      'open-meteo-geocoding',
      'search',
      { q, language },
      geocodingUrl(q, language),
      () => ({
        ...geocodingFixture,
        results: geocodingFixture.results.filter((r) => r.name.toLowerCase().startsWith(q.slice(0, 3))),
      }),
      (json, retrievedAt, demo) => parsePlaces(json, { retrievedAt, demo }),
      signal,
    );
  }

  /**
   * Local climate from the last ten complete years of ERA5 reanalysis: hardiness, frost dates, season
   * length, heat days, normals and Köppen class. Fetched once per coarse cell and cached for a year.
   */
  climateProfile(lat: number, lon: number, signal?: AbortSignal): Promise<ClimateProfile> {
    const c = roundCoords(lat, lon, PROVIDERS['open-meteo-historical'].gridDeg ?? 0.1);
    const endYear = new Date(this.now()).getUTCFullYear() - 1;
    const startYear = endYear - 9;
    const info = PROVIDERS['open-meteo-historical'];
    return this.get(
      'open-meteo-historical',
      'climate-profile',
      { ...c, startYear, endYear },
      // One extra year so northern July–June frost seasons are complete for the whole period.
      archiveUrl(c.lat, c.lon, startYear - 1, endYear),
      // Demo data: a warm, frost-free seasonal curve, clearly labelled as demo in provenance.
      () => dailyFixture({ from: startYear - 1, to: endYear, mean: 25, amplitude: 4, diurnal: 7 }),
      (json, retrievedAt, demo) => {
        const series = parseArchive(json);
        const s = climateSummary(series, startYear, endYear, c.lat >= 0 ? 'north' : 'south');
        return {
          provenance: {
            provider: 'open-meteo-historical',
            retrievedAt,
            lat: c.lat,
            lon: c.lon,
            grid: '≈ 0.25° (ERA5) / 0.1° (ERA5-Land)',
            model: 'ERA5',
            licence: info.licence,
            attribution: info.attribution,
            sourceUrl: info.sourceUrl,
            stale: false,
            demo,
          },
          period: s.period,
          years: s.years,
          coverage: Math.round(s.coverage * 1000) / 1000,
          extremeMinC: s.extremeMinC,
          hardinessZone: s.hardinessZone,
          frost: s.frost
            ? {
                frostSeasonsPct: s.frost.frostSeasonsPct,
                lastSpring: s.frost.lastSpring,
                firstAutumn: s.frost.firstAutumn,
              }
            : null,
          seasonDays: s.seasonDays,
          hotDaysPerYear: s.hotDaysPerYear,
          hotSummers: s.hotSummers,
          koppen: s.koppen,
          months: s.normals.months,
          annualMeanC: s.normals.annualMeanC,
          annualPrecipMm: s.normals.annualPrecipMm,
          tmaxP90ByMonth: s.tmaxP90ByMonth,
          tminP10ByMonth: s.tminP10ByMonth,
          method:
            'Daily ERA5 reanalysis; hardiness from the mean annual extreme minimum; frost dates are the 50th/90th percentile of last spring and first autumn frost (≤ 0 °C). Reanalysis smooths local extremes.',
        };
      },
      signal,
    );
  }

  /**
   * Climate model change (§6.15): CMIP6 HighResMIP daily data for 1991–2014 and 2031–2050, each model
   * compared with its own baseline. About 3 MB of JSON per coarse cell; cached for a year.
   */
  climateProjection(lat: number, lon: number, signal?: AbortSignal): Promise<ClimateProjection> {
    const c = roundCoords(lat, lon, PROVIDERS['open-meteo-climate'].gridDeg ?? 0.1);
    const info = PROVIDERS['open-meteo-climate'];
    const baseline: [number, number] = [1991, 2014];
    const future: [number, number] = [2031, 2050];
    return this.get(
      'open-meteo-climate',
      'projection',
      c,
      [climateUrl(c.lat, c.lon, baseline[0], baseline[1]), climateUrl(c.lat, c.lon, future[0], future[1])],
      () => [
        dailyFixture({ from: baseline[0], to: baseline[1], models: CLIMATE_MODELS }),
        dailyFixture({ from: future[0], to: future[1], models: CLIMATE_MODELS, mean: 16.3 }),
      ],
      (json, retrievedAt, demo) => {
        const [a, b] = Array.isArray(json) ? json : [json, null];
        const base = parseClimate(a);
        const fut = b ? parseClimate(b) : [];
        const merged = base.map((m) => {
          const f = fut.find((x) => x.model === m.model);
          return {
            model: m.model,
            series: f
              ? {
                  dates: [...m.series.dates, ...f.series.dates],
                  tmax: [...m.series.tmax, ...f.series.tmax],
                  tmin: [...m.series.tmin, ...f.series.tmin],
                  precip: [...m.series.precip, ...f.series.precip],
                }
              : m.series,
          };
        });
        const d = climateDeltas(merged, baseline, future);
        return {
          provenance: {
            provider: 'open-meteo-climate',
            retrievedAt,
            lat: c.lat,
            lon: c.lon,
            grid: 'model grids ≈ 0.1–0.5°, downscaled by Open-Meteo',
            model: d.models.join(', ') || null,
            licence: info.licence,
            attribution: info.attribution,
            sourceUrl: info.sourceUrl,
            stale: false,
            demo,
          },
          ...d,
        };
      },
      signal,
    );
  }

  solarClimatology(lat: number, lon: number, signal?: AbortSignal): Promise<SolarClimatology> {
    const c = roundCoords(lat, lon, PROVIDERS['nasa-power'].gridDeg ?? 0.1);
    return this.get(
      'nasa-power',
      'climatology',
      c,
      solarClimatologyUrl(c.lat, c.lon),
      () => solarFixture(),
      (json, retrievedAt, demo) => parseSolarClimatology(json, { ...c, retrievedAt, demo }),
      signal,
    );
  }
}
