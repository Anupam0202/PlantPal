import type { ModelInfo, ModelRole } from '@plantpal/schemas';
import { AiError, classifyGeminiError } from './errors';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Seed defaults (§18.3): preferred ids, re-verified against the key's live model list at runtime and
 * used only when the key lists them and they answer. On 6 Nov 2026 the 2.5 Flash models were listed
 * but closed to new keys, so they are no longer seeds.
 */
export const MODEL_SEEDS: Record<ModelRole, { ids: string[]; verifiedAt: string }> = {
  balanced: { ids: ['gemini-3.5-flash'], verifiedAt: '2026-11-06' },
  fast: { ids: ['gemini-3.5-flash-lite'], verifiedAt: '2026-11-06' },
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
  thinking?: boolean;
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
        thinking: typeof m.thinking === 'boolean' ? m.thinking : null,
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

const TEXT_ROLES: ReadonlySet<ModelRole> = new Set(['fast', 'balanced', 'deep']);

const shortName = (name: string) => name.replace(/^models\//, '');
const unstable = (name: string) => /(preview|exp|experimental)/i.test(name);

/**
 * Words that mark a model as made for something other than written answers (speech, images, music,
 * agents). A naming hint only: such models are ranked last and hidden from the model picker, never
 * required or relied on. If Google stops using these words, ranking by capability still works.
 */
const SPECIAL_PURPOSE =
  /(tts|audio|speech|transcribe|image|banana|lyria|music|live|embedding|robotics|computer-use|research|antigravity|customtools)/i;
const special = (m: ModelInfo) => SPECIAL_PURPOSE.test(`${m.name} ${m.displayName}`);

/** Numeric version key from a model id (gemini-3.5-flash → [3, 5]) for "newest in the family". */
function versionKey(name: string): number[] {
  const m = /gemini-(\d+)(?:\.(\d+))?/.exec(name);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : [0, 0];
}

/** Name families PlantPal has seen; a preference only, used before ranking by capability. */
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
 * Orders models by what the list says they can do, not by name: general-purpose first, then able
 * to think, then the largest input and output limits, then stable before preview, then the
 * shortest id (aliases such as "…-latest" are short and general).
 */
function byCapability(a: ModelInfo, b: ModelInfo): number {
  const score = (m: ModelInfo) => [
    special(m) ? 0 : 1,
    m.thinking ? 1 : 0,
    m.inputTokenLimit ?? 0,
    m.outputTokenLimit ?? 0,
    unstable(m.name) ? 0 : 1,
  ];
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i]! - sa[i]!;
  const na = shortName(a.name);
  const nb = shortName(b.name);
  return na.length - nb.length || (na < nb ? -1 : na > nb ? 1 : 0);
}

/**
 * Models that can write text answers, best first. Special-purpose models are left out while any
 * other model is listed.
 */
export function textModels(models: readonly ModelInfo[], exclude: Iterable<string> = []): ModelInfo[] {
  const skip = new Set([...exclude].map(shortName));
  const all = models.filter((m) => m.methods.includes('generateContent') && !skip.has(shortName(m.name)));
  const general = all.filter((m) => !special(m));
  return [...(general.length > 0 ? general : all)].sort(byCapability);
}

/**
 * Picks a model per role (§18.3). In order: the person's override when the key lists it, a seed id
 * when listed, the newest stable model of a known name family, and finally the best model by
 * capability, so a key whose models follow no known naming still gets working roles. Models in
 * `exclude` (tried and found unusable) are never picked. Never iterates through a long chain.
 */
export function pickModels(
  models: readonly ModelInfo[],
  overrides: Partial<Record<ModelRole, string>> = {},
  exclude: Iterable<string> = [],
): Partial<Record<ModelRole, string>> {
  const skip = new Set([...exclude].map(shortName));
  const usable = models.filter((m) => !skip.has(shortName(m.name)));
  const text = textModels(usable);
  const out: Partial<Record<ModelRole, string>> = {};
  for (const role of Object.keys(ROLE_METHOD) as ModelRole[]) {
    const method = ROLE_METHOD[role];
    const isText = TEXT_ROLES.has(role);
    const capable = isText ? text : usable.filter((m) => m.methods.includes(method));
    const override = overrides[role];
    if (override && capable.some((m) => shortName(m.name) === shortName(override))) {
      out[role] = shortName(override);
      continue;
    }
    const family = capable.filter(
      (m) => familyOf(role).test(shortName(m.name)) && (role === 'image' || !/tts|audio-only/i.test(m.name)),
    );
    const seed = MODEL_SEEDS[role].ids.find((id) => family.some((m) => shortName(m.name) === id));
    if (seed && (!unstable(seed) || role === 'deep')) {
      out[role] = seed;
      continue;
    }
    const stable = family.filter((m) => !unstable(m.name));
    const pool = stable.length > 0 && role !== 'deep' ? stable : family;
    const newest = [...pool].sort((a, b) => {
      const [a1, a2] = versionKey(a.name);
      const [b1, b2] = versionKey(b.name);
      return b1! - a1! || b2! - a2! || (shortName(a.name) < shortName(b.name) ? -1 : 1);
    })[0];
    if (newest) {
      out[role] = shortName(newest.name);
      continue;
    }
    // No known name: text roles take the best text model by capability. Embeddings and live voice
    // take any model with the right method; image generation is only picked by name.
    const fallback = isText ? text[0] : role === 'image' ? undefined : [...capable].sort(byCapability)[0];
    if (fallback) out[role] = shortName(fallback.name);
  }
  return out;
}

/**
 * Asks one model for a one-word reply to confirm the key can really use it: a listed model can
 * still be closed to new users or need billing. About 20 tokens, no thinking setting (so it works
 * on any model); any successful answer counts, even one cut short by the tiny output limit.
 */
export async function probeModel(
  key: string,
  model: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal; deadlineMs?: number } = {},
): Promise<void> {
  const f = opts.fetch ?? fetch;
  const deadline = AbortSignal.timeout(opts.deadlineMs ?? 20_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  let res: Response;
  try {
    res = await f(`${GEMINI_BASE}/models/${encodeURIComponent(shortName(model))}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the word OK.' }] }],
        generationConfig: { maxOutputTokens: 16 },
      }),
      signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    if (opts.signal?.aborted) throw new AiError('CANCELLED', 'Cancelled');
    if (deadline.aborted) throw new AiError('TIMEOUT', 'The test request took too long.');
    throw new AiError('NETWORK', 'Could not reach the Gemini API');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as unknown;
    throw classifyGeminiError(res.status, body, res.headers.get('retry-after'));
  }
}

export interface Discovery {
  roles: Partial<Record<ModelRole, string>>;
  /** Text models the key can use, best first, for the person's own choice per role. */
  available: string[];
  /** Models that were tried and are closed to this key (not available, or billing needed). */
  unusable: string[];
  /**
   * Set when the test request could not finish for a passing reason (rate limit, daily quota,
   * network). Listing the models worked, so the key itself is fine.
   */
  unverified: AiError | null;
}

const PASSING = new Set(['RATE_LIMITED', 'DAILY_QUOTA', 'NETWORK', 'TIMEOUT']);
const CLOSED_MODEL = new Set(['MODEL_UNAVAILABLE', 'BILLING_REQUIRED']);

/**
 * Checks a key the way Google decides it: lists its models (any error, such as an invalid key,
 * stops here), picks one per role, then sends one tiny request to the main text model. A model
 * that turns out closed is left out and the next pick tried, at most `maxProbes` times in all.
 */
export async function discoverModels(
  key: string,
  opts: {
    overrides?: Partial<Record<ModelRole, string>>;
    unusable?: readonly string[];
    fetch?: typeof fetch;
    signal?: AbortSignal;
    maxProbes?: number;
  } = {},
): Promise<Discovery> {
  const models = await listModels(key, opts);
  const unusable = new Set((opts.unusable ?? []).map(shortName));
  let unverified: AiError | null = null;
  for (let probe = 0; ; probe++) {
    const roles = pickModels(models, opts.overrides, unusable);
    const main = roles.balanced ?? roles.fast;
    if (!main) throw new AiError('MODEL_UNAVAILABLE', 'The key lists no model that can write text.');
    try {
      await probeModel(key, main, opts);
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      if (CLOSED_MODEL.has(e.code)) {
        unusable.add(main);
        if (probe + 1 >= (opts.maxProbes ?? 3)) throw e;
        continue;
      }
      if (!PASSING.has(e.code)) throw e;
      unverified = e;
    }
    return {
      roles,
      available: textModels(models, unusable).map((m) => shortName(m.name)),
      unusable: [...unusable],
      unverified,
    };
  }
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
