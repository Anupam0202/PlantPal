import type {
  AirQuality,
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
import { airFixture, elevationFixture, forecastFixture, geocodingFixture, solarFixture } from './fixtures';
import { airUrl, parseAir } from './openMeteo/air';
import { elevationUrl, parseElevation } from './openMeteo/elevation';
import { forecastUrl, parseForecast } from './openMeteo/forecast';
import { geocodingUrl, parsePlaces } from './openMeteo/geocoding';
import { parseSolarClimatology, solarClimatologyUrl } from './nasaPower/climatology';

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
    url: string,
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
          const res = await fetchJson(url, {
            provider: id,
            deadlineMs: info.deadlineMs,
            fetch: this.opts.fetch,
            signal,
            now: this.now,
            sleep: this.opts.sleep,
            headers: this.opts.userAgent ? { 'User-Agent': this.opts.userAgent } : undefined,
          });
          json = res.json;
          latencyMs = res.latencyMs;
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
        // Failures are never cached; a still-usable stale copy is better than nothing (L07).
        if (usableStale && err.code !== 'ABORTED') return usableStale;
        throw err;
      }
    };

    const p = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
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
