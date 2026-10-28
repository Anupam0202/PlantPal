import type { CacheEntry, FactCache } from '@plantpal/providers';

/**
 * Two-level cache for provider facts: per-isolate memory plus the Workers Cache API (free, no KV writes).
 * Keys never contain precise coordinates: callers round them first.
 */
export class WorkersFactCache implements FactCache {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  constructor(
    private readonly cache: Cache | null,
    private readonly now: () => number = Date.now,
  ) {}

  private url(key: string) {
    return `https://facts.plantpal.internal/${encodeURIComponent(key)}`;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const m = this.memory.get(key) as CacheEntry<T> | undefined;
    if (m && this.now() < m.expiresAt) return m;
    if (!this.cache) return null;
    const res = await this.cache.match(this.url(key));
    if (!res) return null;
    const entry = (await res.json()) as CacheEntry<T>;
    if (this.now() >= entry.expiresAt) return null;
    this.memory.set(key, entry);
    return entry;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.memory.set(key, entry);
    if (this.memory.size > 500) this.memory.delete(this.memory.keys().next().value as string);
    if (!this.cache) return;
    const ttl = Math.max(1, Math.floor((entry.expiresAt - this.now()) / 1000));
    await this.cache.put(
      this.url(key),
      new Response(JSON.stringify(entry), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttl}` },
      }),
    );
  }
}
