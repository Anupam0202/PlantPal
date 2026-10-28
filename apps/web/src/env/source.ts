import {
  AirQuality,
  Elevation,
  Forecast,
  PlaceSearch,
  ProviderStatus,
  SolarClimatology,
  type ProviderId,
} from '@plantpal/schemas';
import {
  EnvClient,
  fetchJson,
  MemoryCache,
  ProviderError,
  roundCoords,
  type CacheEntry,
  type FactCache,
} from '@plantpal/providers';
import type { z } from 'zod';
import { db } from '../data/db';

export type EnvMode = 'gateway' | 'direct' | 'demo';

/** One interface for the three provider modes (ADR-0003). */
export interface EnvSource {
  mode: EnvMode;
  forecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast>;
  air(lat: number, lon: number, signal?: AbortSignal): Promise<AirQuality>;
  elevation(lat: number, lon: number, signal?: AbortSignal): Promise<Elevation>;
  solarClimatology(lat: number, lon: number, signal?: AbortSignal): Promise<SolarClimatology>;
  searchPlaces(q: string, lang: string, signal?: AbortSignal): Promise<PlaceSearch>;
  status(): Promise<ProviderStatus[]>;
}

/** Provider facts cached in IndexedDB so the last good values survive reloads and offline use. */
export class IdbFactCache implements FactCache {
  private readonly memory = new MemoryCache();
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const m = await this.memory.get<T>(key);
    if (m) return m;
    try {
      const row = await db.facts.get(key);
      if (!row || Date.now() >= row.expiresAt) return null;
      const entry = {
        value: row.value as T,
        storedAt: row.storedAt,
        freshUntil: row.freshUntil,
        expiresAt: row.expiresAt,
      };
      await this.memory.set(key, entry);
      return entry;
    } catch {
      return null;
    }
  }
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.memory.set(key, entry);
    try {
      await db.facts.put({ key, ...entry, value: entry.value as unknown });
    } catch {
      // A full disk must never break reading the weather.
    }
  }
}

class ClientSource implements EnvSource {
  constructor(
    readonly mode: 'direct' | 'demo',
    private readonly client: EnvClient,
  ) {}
  forecast = (lat: number, lon: number, s?: AbortSignal) => this.client.forecast(lat, lon, s);
  air = (lat: number, lon: number, s?: AbortSignal) => this.client.air(lat, lon, s);
  elevation = (lat: number, lon: number, s?: AbortSignal) => this.client.elevation(lat, lon, s);
  solarClimatology = (lat: number, lon: number, s?: AbortSignal) => this.client.solarClimatology(lat, lon, s);
  searchPlaces = (q: string, lang: string, s?: AbortSignal) => this.client.searchPlaces(q, lang, s);
  status = async () => this.client.status();
}

/** Calls the PlantPal API; the Worker does caching, rate limiting and attribution. */
class GatewaySource implements EnvSource {
  readonly mode = 'gateway' as const;
  constructor(private readonly base: string) {}

  private async get<S extends z.ZodType>(
    path: string,
    params: Record<string, string>,
    schema: S,
    provider: ProviderId,
    signal?: AbortSignal,
  ): Promise<z.output<S>> {
    const url = `${this.base}/api/v1/${path}?${new URLSearchParams(params).toString()}`;
    // Problem responses (503, 429) surface as typed ProviderErrors from fetchJson.
    const { json } = await fetchJson(url, { provider, deadlineMs: 10_000, signal });
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ProviderError('BAD_RESPONSE', provider, 'Unexpected API response');
    return parsed.data;
  }

  private coords(lat: number, lon: number) {
    // Round before the request leaves the device, even to our own API.
    const c = roundCoords(lat, lon, 0.05);
    return { lat: String(c.lat), lon: String(c.lon) };
  }

  forecast = (lat: number, lon: number, s?: AbortSignal) =>
    this.get('env/forecast', this.coords(lat, lon), Forecast, 'open-meteo-forecast', s);
  air = (lat: number, lon: number, s?: AbortSignal) =>
    this.get('env/air', this.coords(lat, lon), AirQuality, 'open-meteo-air', s);
  elevation = (lat: number, lon: number, s?: AbortSignal) =>
    this.get('env/elevation', this.coords(lat, lon), Elevation, 'open-meteo-elevation', s);
  solarClimatology = (lat: number, lon: number, s?: AbortSignal) =>
    this.get('env/solar', this.coords(lat, lon), SolarClimatology, 'nasa-power', s);
  searchPlaces = (q: string, lang: string, s?: AbortSignal) =>
    this.get('env/places', { q, lang }, PlaceSearch, 'open-meteo-geocoding', s);
  status = async () => {
    const { json } = await fetchJson(`${this.base}/api/v1/status`, { provider: 'status', deadlineMs: 6000 });
    return ((json as { providers?: unknown[] }).providers ?? []).flatMap((p) => {
      const r = ProviderStatus.safeParse(p);
      return r.success ? [r.data] : [];
    });
  };
}

let source: EnvSource | null = null;

export function envMode(): EnvMode {
  if (import.meta.env.VITE_PROVIDERS === 'mock') return 'demo';
  return import.meta.env.VITE_API_BASE_URL ? 'gateway' : 'direct';
}

export function getEnvSource(): EnvSource {
  if (source) return source;
  const mode = envMode();
  if (mode === 'gateway')
    source = new GatewaySource(String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, ''));
  else
    source = new ClientSource(
      mode,
      new EnvClient({ mode: mode === 'demo' ? 'mock' : 'live', cache: new IdbFactCache() }),
    );
  return source;
}
