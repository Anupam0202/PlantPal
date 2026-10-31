import type { ModelInfo, ModelRole } from '@plantpal/schemas';
import { AiError, classifyGeminiError } from './errors';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Seed defaults (§18.3), reported as of 27 Oct 2026 and re-verified against the live model list at
 * runtime: a seed is used only when the user's key actually lists it.
 */
export const MODEL_SEEDS: Record<ModelRole, { ids: string[]; verifiedAt: string }> = {
  balanced: { ids: ['gemini-3.5-flash', 'gemini-2.5-flash'], verifiedAt: '2026-10-27' },
  fast: { ids: ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'], verifiedAt: '2026-10-27' },
  deep: { ids: ['gemini-3.1-pro-preview', 'gemini-2.5-pro'], verifiedAt: '2026-10-27' },
  live: { ids: [], verifiedAt: '2026-10-27' },
  embed: { ids: ['gemini-embedding-001'], verifiedAt: '2026-10-27' },
  image: { ids: [], verifiedAt: '2026-10-27' },
};

interface RawModel {
  name?: string;
  displayName?: string;
  version?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
}

/** Lists the models the key can use (paginated). The key travels in a header, never in the URL. */
export async function listModels(
  key: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<ModelInfo[]> {
  const f = opts.fetch ?? fetch;
  const out: ModelInfo[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = `${GEMINI_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    let res: Response;
    try {
      res = await f(url, { headers: { 'x-goog-api-key': key }, signal: opts.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new AiError('CANCELLED', 'Cancelled');
      throw new AiError('NETWORK', 'Could not reach the Gemini API');
    }
    const body = (await res.json().catch(() => null)) as {
      models?: RawModel[];
      nextPageToken?: string;
    } | null;
    if (!res.ok) throw classifyGeminiError(res.status, body, res.headers.get('retry-after'));
    for (const m of body?.models ?? []) {
      if (!m.name) continue;
      out.push({
        name: m.name,
        displayName: m.displayName ?? m.name,
        version: m.version ?? null,
        inputTokenLimit: m.inputTokenLimit ?? null,
        outputTokenLimit: m.outputTokenLimit ?? null,
        methods: [...(m.supportedGenerationMethods ?? []), ...(m.supportedActions ?? [])],
      });
    }
    pageToken = body?.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return out;
}

const ROLE_METHOD: Record<ModelRole, string> = {
  fast: 'generateContent',
  balanced: 'generateContent',
  deep: 'generateContent',
  live: 'bidiGenerateContent',
  embed: 'embedContent',
  image: 'generateContent',
};

const shortName = (name: string) => name.replace(/^models\//, '');
const unstable = (name: string) => /(preview|exp|experimental)/i.test(name);

/** Numeric version key from a model id (gemini-3.5-flash → [3, 5]) for "newest in the family". */
function versionKey(name: string): number[] {
  const m = /gemini-(\d+)(?:\.(\d+))?/.exec(name);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : [0, 0];
}

function familyOf(role: ModelRole): RegExp {
  switch (role) {
    case 'fast':
      return /gemini-[\d.]+-flash-lite/;
    case 'balanced':
      return /gemini-[\d.]+-flash(?!-lite)/;
    case 'deep':
      return /gemini-[\d.]+-pro/;
    case 'embed':
      return /embedding/;
    case 'image':
      return /image/;
    case 'live':
      return /(live|native-audio)/;
  }
}

/**
 * Picks a model per role (§18.3): supports the method → stable before preview (except where only a
 * preview exists, e.g. deep) → a seed id when present → otherwise the newest in the family. A user
 * override wins when the key lists it. Never iterates through a long fallback chain.
 */
export function pickModels(
  models: readonly ModelInfo[],
  overrides: Partial<Record<ModelRole, string>> = {},
): Partial<Record<ModelRole, string>> {
  const out: Partial<Record<ModelRole, string>> = {};
  for (const role of Object.keys(ROLE_METHOD) as ModelRole[]) {
    const method = ROLE_METHOD[role];
    const supports = models.filter(
      (m) =>
        m.methods.includes(method) &&
        familyOf(role).test(shortName(m.name)) &&
        !/tts|audio-only/i.test(m.name),
    );
    const override = overrides[role];
    if (override && supports.some((m) => shortName(m.name) === shortName(override))) {
      out[role] = shortName(override);
      continue;
    }
    if (supports.length === 0) continue;
    const seed = MODEL_SEEDS[role].ids.find((id) => supports.some((m) => shortName(m.name) === id));
    if (seed && (!unstable(seed) || role === 'deep')) {
      out[role] = seed;
      continue;
    }
    const stable = supports.filter((m) => !unstable(m.name));
    const pool = stable.length > 0 && role !== 'deep' ? stable : supports;
    const best = [...pool].sort((a, b) => {
      const [a1, a2] = versionKey(a.name);
      const [b1, b2] = versionKey(b.name);
      return b1! - a1! || b2! - a2! || (shortName(a.name) < shortName(b.name) ? -1 : 1);
    })[0];
    if (best) out[role] = shortName(best.name);
  }
  return out;
}

export interface Capabilities {
  text: boolean;
  vision: boolean;
  voice: boolean;
  image: boolean;
}

export function capabilitiesOf(roles: Partial<Record<ModelRole, string>>): Capabilities {
  return {
    text: Boolean(roles.balanced ?? roles.fast),
    vision: Boolean(roles.balanced),
    voice: Boolean(roles.live),
    image: Boolean(roles.image),
  };
}
