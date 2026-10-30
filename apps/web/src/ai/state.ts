import {
  idbVaultStore,
  KeyVault,
  memoryVaultStore,
  type VaultMode,
  type VaultStatus,
  type VaultStore,
} from '@plantpal/ai/vault';
import type { AiDataCategory, ModelRole } from '@plantpal/schemas';
import { create } from 'zustand';

/** Feature ids (kept in sync with `@plantpal/ai`'s AiFeatureId; duplicated here to keep this module tiny). */
export type AiFeature =
  | 'plan-explain'
  | 'capture-parse'
  | 'alt-text'
  | 'plain-explain'
  | 'health-triage'
  | 'photo-id'
  | 'species-draft'
  | 'space-detect'
  | 'weekly-reflection';

/** AI settings stay on this device, in the vault database: never synced or exported. */
export interface AiSettings {
  /** The single switch that turns every AI feature off (§18.7). */
  enabled: boolean;
  roles: Partial<Record<ModelRole, string>>;
  /** Text models the key can use, for overrides. */
  available: string[];
  checkedAt: string | null;
  overrides: Partial<Record<ModelRole, string>>;
  /** Categories the person allowed per feature in the send preview. */
  consent: Partial<Record<AiFeature, AiDataCategory[]>>;
  /** Daily soft cap on requests; null = none. */
  dailyCap: number | null;
  /** Experimental features, off until the person turns them on (Settings › AI › Labs). */
  labs: { photoPlan: boolean };
  /** What the Copilot's tools may read, and whether it may search the web; null until first chosen. */
  copilot: { allowed: AiDataCategory[]; search: boolean } | null;
}

export interface PendingAction {
  feature: AiFeature;
  path: string;
  allowed: AiDataCategory[];
  keyVersion: number;
}

const DEFAULTS: AiSettings = {
  enabled: true,
  roles: {},
  available: [],
  checkedAt: null,
  overrides: {},
  consent: {},
  dailyCap: null,
  labs: { photoPlan: false },
  copilot: null,
};

let store: VaultStore | null = null;
let vault: KeyVault | null = null;
let loading: Promise<void> | null = null;

export function aiStore(): VaultStore {
  if (!store) {
    try {
      store = typeof indexedDB === 'undefined' ? memoryVaultStore() : idbVaultStore();
    } catch {
      store = memoryVaultStore();
    }
  }
  return store;
}

export function aiVault(): KeyVault {
  return (vault ??= new KeyVault(aiStore()));
}

interface AiState extends AiSettings {
  loaded: boolean;
  vault: VaultStatus;
  /** Bumps when the key or the models change, so a pending action can resume. */
  keyVersion: number;
  pending: PendingAction | null;
  load: () => Promise<void>;
  update: (patch: Partial<AiSettings>) => Promise<void>;
  saveKey: (key: string, mode: VaultMode, models: Pick<AiSettings, 'roles' | 'available'>) => Promise<void>;
  removeKey: () => Promise<void>;
  setPending: (p: PendingAction | null) => void;
}

const settingsOf = (s: AiSettings): AiSettings => ({
  enabled: s.enabled,
  roles: s.roles,
  available: s.available,
  checkedAt: s.checkedAt,
  overrides: s.overrides,
  consent: s.consent,
  dailyCap: s.dailyCap,
  labs: s.labs,
  copilot: s.copilot,
});

export const useAiState = create<AiState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  vault: { mode: null, hint: null, savedAt: null },
  keyVersion: 0,
  pending: null,
  load: () =>
    (loading ??= (async () => {
      try {
        const saved = await aiStore().get<Partial<AiSettings>>('settings');
        const status = await aiVault().status();
        set({
          ...DEFAULTS,
          ...saved,
          labs: { ...DEFAULTS.labs, ...saved?.labs },
          vault: status,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    })()),
  update: async (patch) => {
    const next = { ...settingsOf(get()), ...patch };
    const modelsChanged = patch.roles !== undefined;
    set({ ...patch, ...(modelsChanged ? { keyVersion: get().keyVersion + 1 } : {}) });
    await aiStore()
      .put('settings', next)
      .catch(() => undefined);
  },
  saveKey: async (key, mode, models) => {
    await aiVault().save(key, mode);
    const status = await aiVault().status();
    set({ vault: status, keyVersion: get().keyVersion + 1 });
    await get().update({ ...models, checkedAt: new Date().toISOString() });
  },
  removeKey: async () => {
    await aiVault().remove();
    set({ vault: { mode: null, hint: null, savedAt: null }, keyVersion: get().keyVersion + 1 });
    await get().update({ roles: {}, available: [], checkedAt: null });
  },
  setPending: (pending) => set({ pending }),
}));
