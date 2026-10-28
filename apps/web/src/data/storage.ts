import { isQuotaError, StorageFullError } from './errors';

/** Runtime caches that can be dropped to make room for user records. Records and the outbox are never evicted. */
const EVICTABLE_CACHES = ['pp-tiles', 'pp-images', 'pp-facts'];

export async function evictCaches(): Promise<number> {
  if (typeof caches === 'undefined') return 0;
  let n = 0;
  for (const name of EVICTABLE_CACHES) if (await caches.delete(name)) n++;
  return n;
}

/**
 * Runs a write; on a quota error it clears evictable caches and retries once, then raises
 * `StorageFullError` so the UI can keep the draft in memory and offer an export.
 */
export async function withQuotaRecovery<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (e) {
    if (!isQuotaError(e)) throw e;
    await evictCaches();
    try {
      return await write();
    } catch (e2) {
      if (isQuotaError(e2)) throw new StorageFullError(e2);
      throw e2;
    }
  }
}

export interface StorageInfo {
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  const [estimate, persisted] = await Promise.all([
    s?.estimate ? s.estimate().catch(() => null) : null,
    s?.persisted ? s.persisted().catch(() => null) : null,
  ]);
  return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, persisted };
}

/** Asks the browser not to evict PlantPal's data under storage pressure. The browser decides. */
export async function requestPersistence(): Promise<boolean | null> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.persist) return null;
  try {
    return await s.persist();
  } catch {
    return null;
  }
}
