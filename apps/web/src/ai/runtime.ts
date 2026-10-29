/**
 * AI runtime, loaded on demand (dynamic import) so the client, prompts and JSON Schema code stay out
 * of the initial bundle. All calls go from this device to Gemini with the person's own key.
 */
import {
  AiError,
  altTextV1,
  captureParseV1,
  GeminiClient,
  listModels,
  overSoftCap,
  pickModels,
  plainExplainV1,
  planExplainV1,
  systemInstruction,
  UsageMeter,
  type AiFeatureId,
  type AiResult,
  type ContextSection,
  type DayUsage,
  type PromptModule,
} from '@plantpal/ai';
import type { AiDataCategory, ModelRole } from '@plantpal/schemas';
import { aiStore, aiVault, useAiState, type AiFeature } from './state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one table of differently typed modules
const MODULES: Record<AiFeatureId, PromptModule<any, any>> = {
  'plan-explain': planExplainV1,
  'capture-parse': captureParseV1,
  'alt-text': altTextV1,
  'plain-explain': plainExplainV1,
};

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const meter = () => new UsageMeter(aiStore());

export function sectionsOf(feature: AiFeature, input: unknown): ContextSection[] {
  return MODULES[feature].sections(input);
}

export function instructionsOf(feature: AiFeature, input: unknown): string {
  return systemInstruction(MODULES[feature], input);
}

export function modelFor(feature: AiFeature): string | null {
  return useAiState.getState().roles[MODULES[feature].role] ?? null;
}

/** Lists the key's models and picks one per role, honouring the person's overrides. */
export async function discover(key: string, overrides = useAiState.getState().overrides) {
  const models = await listModels(key);
  const roles = pickModels(models, overrides);
  const available = models
    .filter((m) => m.methods.includes('generateContent') && /gemini/i.test(m.name))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort();
  return { roles, available };
}

export async function recheckModels(): Promise<void> {
  const key = await aiVault().get();
  if (!key) throw new AiError('KEY_MISSING', 'No key');
  const { roles, available } = await discover(key);
  await useAiState.getState().update({ roles, available, checkedAt: new Date().toISOString() });
}

export async function capReached(): Promise<number | null> {
  const cap = useAiState.getState().dailyCap;
  if (cap === null) return null;
  const { requests } = await meter().today(localDay());
  return overSoftCap(requests, cap) ? cap : null;
}

export async function usage(): Promise<{ today: { requests: number; tokens: number }; days: DayUsage[] }> {
  const m = meter();
  return { today: await m.today(localDay()), days: await m.all() };
}

export async function clearUsage(): Promise<void> {
  await meter().clear();
}

export async function run<T>(
  feature: AiFeature,
  input: unknown,
  allowed: readonly AiDataCategory[],
  signal?: AbortSignal,
): Promise<AiResult<T>> {
  const state = useAiState.getState();
  if (!state.enabled) throw new AiError('AI_DISABLED', 'AI is switched off');
  const usageMeter = meter();
  const client = new GeminiClient({
    getKey: () => aiVault().get(),
    roles: () => useAiState.getState().roles,
    rediscover: async (): Promise<Partial<Record<ModelRole, string>>> => {
      await recheckModels();
      return useAiState.getState().roles;
    },
    onUsage: (u) => void usageMeter.record(u, localDay()),
  });
  return client.generateStructured(MODULES[feature] as PromptModule<unknown, T>, input, {
    signal,
    allowed: new Set(allowed),
  });
}
