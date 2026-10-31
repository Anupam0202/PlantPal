/** A cached provider payload with its freshness window. */
export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  /** After this the entry is stale (served only while revalidating or when the provider fails). */
  freshUntil: number;
  /** After this the entry must not be served at all. */
  expiresAt: number;
}

export interface FactCache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export class MemoryCache implements FactCache {
  private readonly map = new Map<string, CacheEntry<unknown>>();
  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return (this.map.get(key) as CacheEntry<T> | undefined) ?? null;
  }
  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.map.set(key, entry);
  }
  clear(): void {
    this.map.clear();
  }
}

/** Cache key = provider | endpoint | version | sorted params (master prompt §15.4). */
export function cacheKey(
  provider: string,
  endpoint: string,
  version: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const p = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `${provider}|${endpoint}|${version}|${p}`;
}
