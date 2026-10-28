import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { providerStatus } from '@plantpal/db';
import type { ProviderId, ProviderStatus } from '@plantpal/schemas';
import type { StatusEvent } from '@plantpal/providers';

/** Persists provider health and kill switches. */
export interface StatusStore {
  record(e: StatusEvent): Promise<void>;
  list(): Promise<Array<Omit<ProviderStatus, 'circuit'>>>;
  disabled(): Promise<ProviderId[]>;
}

export class MemoryStatusStore implements StatusStore {
  readonly rows = new Map<ProviderId, Omit<ProviderStatus, 'circuit'>>();
  readonly off = new Set<ProviderId>();
  async record(e: StatusEvent) {
    const prev = this.rows.get(e.provider);
    const iso = new Date(e.at).toISOString();
    this.rows.set(e.provider, {
      provider: e.provider,
      enabled: !this.off.has(e.provider),
      lastSuccessAt: e.ok ? iso : (prev?.lastSuccessAt ?? null),
      lastErrorAt: e.ok ? (prev?.lastErrorAt ?? null) : iso,
      lastErrorCode: e.ok ? (prev?.lastErrorCode ?? null) : e.code,
      lastLatencyMs: e.latencyMs ?? prev?.lastLatencyMs ?? null,
      consecutiveFailures: e.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1,
    });
  }
  async list() {
    return [...this.rows.values()];
  }
  async disabled() {
    return [...this.off];
  }
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** D1 implementation (Drizzle). Writes are single upserts; reads are one indexed scan of a tiny table. */
export class D1StatusStore implements StatusStore {
  private readonly db;
  constructor(d1: D1Database) {
    this.db = drizzle(d1);
  }

  async record(e: StatusEvent) {
    await this.db
      .insert(providerStatus)
      .values({
        provider: e.provider,
        lastSuccessAt: e.ok ? e.at : null,
        lastErrorAt: e.ok ? null : e.at,
        lastErrorCode: e.ok ? null : e.code,
        lastLatencyMs: e.latencyMs,
        consecutiveFailures: e.ok ? 0 : 1,
        updatedAt: e.at,
      })
      .onConflictDoUpdate({
        target: providerStatus.provider,
        set: e.ok
          ? { lastSuccessAt: e.at, lastLatencyMs: e.latencyMs, consecutiveFailures: 0, updatedAt: e.at }
          : {
              lastErrorAt: e.at,
              lastErrorCode: e.code,
              consecutiveFailures: sql`${providerStatus.consecutiveFailures} + 1`,
              updatedAt: e.at,
            },
      });
  }

  async list() {
    const rows = await this.db.select().from(providerStatus);
    return rows.map((r) => ({
      provider: r.provider as ProviderId,
      enabled: r.enabled,
      lastSuccessAt: iso(r.lastSuccessAt),
      lastErrorAt: iso(r.lastErrorAt),
      lastErrorCode: r.lastErrorCode,
      lastLatencyMs: r.lastLatencyMs,
      consecutiveFailures: r.consecutiveFailures,
    }));
  }

  async disabled() {
    const rows = await this.db
      .select({ provider: providerStatus.provider })
      .from(providerStatus)
      .where(eq(providerStatus.enabled, false));
    return rows.map((r) => r.provider as ProviderId);
  }
}
