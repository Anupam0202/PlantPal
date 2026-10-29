import { looksLikeGeminiKey } from './errors';

/**
 * Key vault (§18.2). Two modes:
 *  - `session`: the key lives in memory only and is gone when the tab closes.
 *  - `device`: the key is encrypted with AES-GCM under a non-extractable WebCrypto key; both the
 *    CryptoKey object and the ciphertext live in a separate IndexedDB database (`plantpal-vault`).
 *
 * The key is never written to localStorage, cookies, the app database, sync, exports, logs or URLs.
 * While the vault is unlocked, code running in the page could use the key; a strict CSP and no
 * third-party scripts reduce that risk but cannot remove it (shown honestly in Settings › AI).
 */

export type VaultMode = 'session' | 'device';

export interface VaultStatus {
  mode: VaultMode | null;
  /** Last four characters, so people can tell which key is stored. */
  hint: string | null;
  savedAt: string | null;
}

/** Minimal async key–value store; IndexedDB in the browser, a Map in unit tests. */
export interface VaultStore {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

interface SealedKey {
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  hint: string;
  savedAt: string;
}

export const VAULT_DB = 'plantpal-vault';
const STORE = 'kv';

/** IndexedDB-backed store in its own database, separate from the app data (never exported or synced). */
export function idbVaultStore(factory: IDBFactory = indexedDB): VaultStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = factory.open(VAULT_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Vault unavailable'));
    }));
  const run = <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> =>
    db().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(req.result as T);
          tx.onerror = () => reject(tx.error ?? new Error('Vault write failed'));
          tx.onabort = () => reject(tx.error ?? new Error('Vault write aborted'));
        }),
    );
  return {
    get: (key) => run('readonly', (s) => s.get(key)),
    put: (key, value) => run('readwrite', (s) => s.put(value, key)),
    delete: (key) => run('readwrite', (s) => s.delete(key)),
  };
}

export function memoryVaultStore(): VaultStore & { dump(): Map<string, unknown> } {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => m.get(k) as T | undefined,
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
    dump: () => m,
  };
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export class KeyVault {
  private sessionKey: string | null = null;
  private cached: string | null = null;

  constructor(
    private readonly store: VaultStore,
    private readonly subtle: SubtleCrypto = globalThis.crypto.subtle,
    private readonly random: (a: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (a) =>
      globalThis.crypto.getRandomValues(a),
  ) {}

  async status(): Promise<VaultStatus> {
    if (this.sessionKey) return { mode: 'session', hint: this.sessionKey.slice(-4), savedAt: null };
    const sealed = await this.store.get<SealedKey>('sealed').catch(() => undefined);
    if (sealed) return { mode: 'device', hint: sealed.hint, savedAt: sealed.savedAt };
    return { mode: null, hint: null, savedAt: null };
  }

  /** Stores a key. Replaces any key held in either mode. */
  async save(key: string, mode: VaultMode, now = new Date()): Promise<void> {
    const value = key.trim();
    if (!looksLikeGeminiKey(value)) throw new Error('That does not look like a Gemini API key.');
    await this.remove();
    if (mode === 'session') {
      this.sessionKey = value;
      return;
    }
    const wrapping = await this.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    const iv = this.random(new Uint8Array(12));
    const ct = await this.subtle.encrypt({ name: 'AES-GCM', iv }, wrapping, enc.encode(value));
    await this.store.put('wrapping', wrapping);
    await this.store.put('sealed', {
      iv,
      ct,
      hint: value.slice(-4),
      savedAt: now.toISOString(),
    } satisfies SealedKey);
    this.cached = value;
  }

  /** The plaintext key for an outgoing Gemini request, or null when none is stored. */
  async get(): Promise<string | null> {
    if (this.sessionKey) return this.sessionKey;
    if (this.cached) return this.cached;
    const [wrapping, sealed] = await Promise.all([
      this.store.get<CryptoKey>('wrapping').catch(() => undefined),
      this.store.get<SealedKey>('sealed').catch(() => undefined),
    ]);
    if (!wrapping || !sealed) return null;
    try {
      const pt = await this.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv }, wrapping, sealed.ct);
      this.cached = dec.decode(pt);
      return this.cached;
    } catch {
      // Tampered or from another browser profile: treat as missing.
      return null;
    }
  }

  /** Forgets the key in every mode. */
  async remove(): Promise<void> {
    this.sessionKey = null;
    this.cached = null;
    await this.store.delete('sealed').catch(() => undefined);
    await this.store.delete('wrapping').catch(() => undefined);
  }

  /** Drops the decrypted copy from memory (the encrypted copy stays). */
  lock(): void {
    this.cached = null;
  }
}
