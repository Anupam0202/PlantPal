import { LEGACY_KEYS } from '@plantpal/domain';

/** Marker used instead of the real key, so the plaintext key never leaves localStorage. */
const KEY_PRESENT = '[present]';

/** Reads every PlantPal v3 key from localStorage. The plaintext Gemini key is replaced by a marker. */
export function readLegacyStorage(
  storage: Storage | undefined = globalThis.localStorage,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!storage) return out;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith('plantpal-')) continue;
      const v = storage.getItem(k);
      if (v === null) continue;
      out[k] = k === LEGACY_KEYS.apiKey ? (v.length > 0 ? KEY_PRESENT : '') : v;
    }
  } catch {
    // Storage blocked (privacy mode): nothing to migrate.
  }
  return out;
}

export function hasLegacyData(storage: Storage | undefined = globalThis.localStorage): boolean {
  const raw = readLegacyStorage(storage);
  return Object.keys(raw).some(
    (k) => k !== LEGACY_KEYS.apiKey && k !== LEGACY_KEYS.theme && k !== LEGACY_KEYS.envProfile,
  );
}

/** The plaintext v3 Gemini key, read only to move it into the vault (then deleted). */
export function readPlaintextKey(storage: Storage | undefined = globalThis.localStorage): string | null {
  try {
    const v = storage?.getItem(LEGACY_KEYS.apiKey);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Deletes the plaintext v3 Gemini key from this browser. */
export function deletePlaintextKey(storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.removeItem(LEGACY_KEYS.apiKey);
  } catch {
    // ignore
  }
}

/** Removes all v3 keys after the user confirms the migration result (the backup file stays with them). */
export function removeLegacyData(storage: Storage | undefined = globalThis.localStorage): number {
  if (!storage) return 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith('plantpal-')) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}
