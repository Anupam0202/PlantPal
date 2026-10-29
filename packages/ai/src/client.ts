import type { AiDataCategory, ModelRole } from '@plantpal/schemas';
import { z } from 'zod';
import { GEMINI_BASE } from './discovery';
import { AiError, classifyGeminiError, redactKeys } from './errors';
import { sharedPolicy, type PolicyContext } from './policy';
import {
  consentedSections,
  partsOf,
  systemInstruction,
  type GeminiPart,
  type PromptModule,
  type Thinking,
} from './prompt';

/** Usage of one request, recorded by the local meter. */
export interface UsageRecord {
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  at: string;
}

/** Local run metadata (§18.8); stays on the device. */
export interface AiRunMeta {
  feature: string;
  promptVersion: number;
  model: string;
  attempts: number;
  repaired: boolean;
  degraded: string[];
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface AiResult<T> {
  data: T;
  meta: AiRunMeta;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  /** Categories the person allowed in the send preview; null means everything the feature builds. */
  allowed?: ReadonlySet<AiDataCategory> | null;
}

/** The vendor-neutral interface the app codes against (§18.4). Chat, live and embeddings arrive later. */
export interface AiClient {
  generateStructured<I, T>(m: PromptModule<I, T>, input: I, opts?: GenerateOptions): Promise<AiResult<T>>;
}

export interface GeminiClientOptions {
  getKey: () => Promise<string | null>;
  /** Model id per role, from discovery. */
  roles: () => Partial<Record<ModelRole, string>>;
  /** Re-runs discovery once after MODEL_UNAVAILABLE and returns the new roles. */
  rediscover?: () => Promise<Partial<Record<ModelRole, string>>>;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onUsage?: (u: UsageRecord) => void;
  deadlineMs?: number;
}

const MAX_ATTEMPTS = 2;
const MAX_RETRY_WAIT_MS = 20_000;

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
}

function thinkingConfig(model: string, thinking: Thinking): Record<string, unknown> | null {
  if (thinking === 'default') return null;
  if (/gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  if (/gemini-2\.5-flash/.test(model)) return { thinkingBudget: thinking === 'minimal' ? 0 : 512 };
  return null;
}

/** Turns a model response into text, or throws the matching finish-reason error. */
export function finalText(body: GeminiResponse): string {
  const block = body.promptFeedback?.blockReason;
  if (block) throw new AiError('SAFETY_BLOCKED', `Blocked: ${block}`);
  const c = body.candidates?.[0];
  if (!c) throw new AiError('NO_FINAL_OUTPUT', 'The model returned no answer.');
  switch (c.finishReason) {
    case 'MAX_TOKENS':
      throw new AiError('OUTPUT_TRUNCATED', 'The answer was cut off.');
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
    case 'SPII':
    case 'IMAGE_SAFETY':
      throw new AiError('SAFETY_BLOCKED', `Blocked: ${c.finishReason}`);
    case 'RECITATION':
      throw new AiError('RECITATION', 'The answer was withheld because it repeated a source.');
    default:
      break;
  }
  const text = (c.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) throw new AiError('NO_FINAL_OUTPUT', 'The model returned no answer.');
  return text;
}

const KEEP = new Set([
  'type',
  'properties',
  'required',
  'items',
  'enum',
  'anyOf',
  'description',
  'title',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'format',
  'propertyOrdering',
]);

/**
 * Reduces a JSON Schema to the conservative subset Gemini documents for `responseJsonSchema`
 * (anyOf, type "null", enum, min/max, items; Nov 2025 announcement): `oneOf` → `anyOf`, `const` →
 * single-value `enum`, type arrays → `anyOf`; length and pattern limits are dropped (the Zod parse
 * after the call still enforces them).
 */
export function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== 'object') return node;
  const src = node as Record<string, unknown>;
  // `type: ["string", "null"]` → anyOf of single types (type arrays are not in the documented subset).
  if (Array.isArray(src.type)) {
    const { type, ...rest } = src;
    return {
      anyOf: (type as string[]).map((t) =>
        t === 'null' ? { type: 'null' } : geminiSchema({ ...rest, type: t }),
      ),
    };
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'oneOf') out.anyOf = geminiSchema(v);
    else if (k === 'const') out.enum = [v];
    else if (k === 'maximum' && typeof v === 'number' && v >= Number.MAX_SAFE_INTEGER) continue;
    else if (k === 'minimum' && typeof v === 'number' && v <= Number.MIN_SAFE_INTEGER) continue;
    else if (k === 'properties' && v && typeof v === 'object')
      out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    else if (KEEP.has(k)) out[k] = geminiSchema(v);
  }
  return out;
}

/** Builds the JSON Schema sent as `responseJsonSchema` from the Zod schema. */
export function responseSchema(schema: z.ZodType): Record<string, unknown> {
  return geminiSchema(z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' })) as Record<
    string,
    unknown
  >;
}

/**
 * Gemini over REST with `fetch` (ADR-0009). The key travels only in the `x-goog-api-key` header.
 * Policy: ≤ 2 attempts and only for retryable failures; 30 s deadline; one schema repair; re-discover
 * once on MODEL_UNAVAILABLE; never hop across a list of models; no background calls.
 */
export interface GroundedResult {
  text: string;
  /** Web sources from the grounding metadata, deduplicated. */
  sources: Array<{ url: string; title: string }>;
  meta: AiRunMeta;
}

/** A prose request with Google Search grounding (F3 step 1). */
export interface GroundedModule<I> {
  id: string;
  version: number;
  role: ModelRole;
  maxOutputTokens: number;
  temperature: number;
  task: string;
  prompt: (input: I) => string;
  policy: (input: I) => PolicyContext;
}

interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export class GeminiClient implements AiClient {
  private readonly f: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly o: GeminiClientOptions) {
    this.f = o.fetch ?? ((...a) => fetch(...a));
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? (() => Date.now());
  }

  private async keyOrThrow(signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw new AiError('CANCELLED', 'Cancelled');
    const key = await this.o.getKey();
    if (!key) throw new AiError('KEY_MISSING', 'Add your Gemini API key in Settings › AI.');
    return key;
  }

  private newMeta(feature: string, version: number, role: ModelRole): AiRunMeta {
    const model = this.o.roles()[role];
    if (!model) throw new AiError('MODEL_UNAVAILABLE', `No ${role} model is available for this key.`);
    return {
      feature,
      promptVersion: version,
      model,
      attempts: 0,
      repaired: false,
      degraded: [],
      inputTokens: 0,
      outputTokens: 0,
      ms: 0,
    };
  }

  /**
   * Sends one logical request under the policy: ≤ 2 attempts for retryable failures, one
   * re-discovery on MODEL_UNAVAILABLE, and an unsupported thinking setting dropped once.
   */
  private async send(
    role: ModelRole,
    meta: AiRunMeta,
    signal: AbortSignal | undefined,
    attempt: (model: string, useThinking: boolean) => Promise<{ text: string; json: GeminiResponse }>,
    state: { useThinking: boolean; rediscovered: boolean },
  ): Promise<{ text: string; json: GeminiResponse }> {
    for (;;) {
      meta.attempts++;
      try {
        return await attempt(meta.model, state.useThinking);
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        if (state.useThinking && e.opts.status === 400 && /thinking/i.test(e.message)) {
          state.useThinking = false;
          meta.degraded.push('thinking');
          meta.attempts--;
          continue;
        }
        if (e.code === 'MODEL_UNAVAILABLE' && !state.rediscovered && this.o.rediscover) {
          state.rediscovered = true;
          const next = (await this.o.rediscover())[role];
          if (next && next !== meta.model) {
            meta.model = next;
            meta.degraded.push('rediscovered');
            meta.attempts--;
            continue;
          }
          throw e;
        }
        if (e.retryable && meta.attempts < MAX_ATTEMPTS) {
          const wait = e.retryAfterMs ?? 1000;
          if (wait > MAX_RETRY_WAIT_MS) throw e;
          await this.sleep(wait);
          if (signal?.aborted) throw new AiError('CANCELLED', 'Cancelled');
          continue;
        }
        throw e;
      }
    }
  }

  async generateStructured<I, T>(
    m: PromptModule<I, T>,
    input: I,
    opts: GenerateOptions = {},
  ): Promise<AiResult<T>> {
    const started = this.now();
    const key = await this.keyOrThrow(opts.signal);

    const { sections, blockedBy } = consentedSections(m.sections(input), opts.allowed ?? null);
    if (blockedBy.length > 0) throw new AiError('CONSENT_REQUIRED', `Needs: ${blockedBy.join(', ')}`);
    const parts = partsOf(sections);
    for (const p of parts) {
      if ('text' in p && /AIza[0-9A-Za-z_-]{35}/.test(p.text))
        throw new AiError('CONSENT_REQUIRED', 'The text contains an API key. Remove it before sending.', {
          detail: 'API_KEY_IN_INPUT',
        });
    }

    const meta = this.newMeta(m.id, m.version, m.role);
    const system = systemInstruction(m, input);
    const jsonSchema = responseSchema(m.schema);
    const state = { useThinking: true, rediscovered: false };
    const contents: Array<{ role: 'user' | 'model'; parts: GeminiPart[] }> = [{ role: 'user', parts }];

    const call = async (): Promise<string> =>
      (
        await this.send(
          m.role,
          meta,
          opts.signal,
          (model, useThinking) => {
            const thinking = useThinking ? thinkingConfig(model, m.thinking) : null;
            if (!thinking) state.useThinking = false;
            return this.post(
              model,
              key,
              {
                systemInstruction: { parts: [{ text: system }] },
                contents,
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseJsonSchema: jsonSchema,
                  temperature: m.temperature,
                  maxOutputTokens: m.maxOutputTokens,
                  ...(thinking ? { thinkingConfig: thinking } : {}),
                },
              },
              meta,
              opts.signal,
            );
          },
          state,
        )
      ).text;

    const parse = (text: string): { ok: true; data: T } | { ok: false; errors: string[] } => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { ok: false, errors: ['The output was not valid JSON. Return a single JSON object only.'] };
      }
      const r = m.schema.safeParse(raw);
      if (!r.success)
        return {
          ok: false,
          errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
        };
      const semantic = m.validate(r.data, input);
      return semantic.length ? { ok: false, errors: semantic } : { ok: true, data: r.data };
    };

    const first = await call();
    let result = parse(first);
    if (!result.ok) {
      // One repair attempt with the validator errors.
      meta.repaired = true;
      contents.push({ role: 'model', parts: [{ text: first }] });
      contents.push({
        role: 'user',
        parts: [
          {
            text: `Your previous output failed validation:\n- ${result.errors.join('\n- ')}\nReturn the corrected JSON only.`,
          },
        ],
      });
      const second = await call();
      result = parse(second);
      if (!result.ok)
        throw new AiError('SCHEMA_INVALID', 'The answer did not pass PlantPal’s checks.', {
          detail: redactKeys(result.errors.join('; ')).slice(0, 500),
        });
    }
    meta.ms = this.now() - started;
    return { data: result.data, meta };
  }

  /** Prose answer with Google Search grounding; sources come only from the grounding metadata. */
  async generateGrounded<I>(
    m: GroundedModule<I>,
    input: I,
    opts: { signal?: AbortSignal } = {},
  ): Promise<GroundedResult> {
    const started = this.now();
    const key = await this.keyOrThrow(opts.signal);
    const meta = this.newMeta(m.id, m.version, m.role);
    const system = `${sharedPolicy(m.policy(input))}\n\n${m.task}`;
    const { text, json } = await this.send(
      m.role,
      meta,
      opts.signal,
      (model) =>
        this.post(
          model,
          key,
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: m.prompt(input) }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: m.temperature, maxOutputTokens: m.maxOutputTokens },
          },
          meta,
          opts.signal,
        ),
      { useThinking: false, rediscovered: false },
    );
    const chunks = ((
      json.candidates?.[0] as { groundingMetadata?: { groundingChunks?: GroundingChunk[] } } | undefined
    )?.groundingMetadata?.groundingChunks ?? []) as GroundingChunk[];
    const seen = new Set<string>();
    const sources = chunks.flatMap((c) => {
      const url = c.web?.uri;
      if (!url || !/^https:\/\//.test(url) || seen.has(url)) return [];
      seen.add(url);
      return [{ url, title: (c.web?.title ?? new URL(url).hostname).slice(0, 200) }];
    });
    meta.ms = this.now() - started;
    return { text, sources, meta };
  }

  private async post(
    model: string,
    key: string,
    body: unknown,
    meta: AiRunMeta,
    signal: AbortSignal | undefined,
  ): Promise<{ text: string; json: GeminiResponse }> {
    const deadline = AbortSignal.timeout(this.o.deadlineMs ?? 30_000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let res: Response;
    try {
      res = await this.f(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: combined,
        // Never send cookies or a referrer to the AI provider.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      if (signal?.aborted) throw new AiError('CANCELLED', 'Cancelled');
      if (deadline.aborted) throw new AiError('TIMEOUT', 'The AI request took too long.');
      throw new AiError('NETWORK', 'Could not reach the Gemini API.');
    }
    const json = (await res.json().catch(() => null)) as GeminiResponse | null;
    if (!res.ok) throw classifyGeminiError(res.status, json, res.headers.get('retry-after'));
    const usage = json?.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
    meta.inputTokens += inputTokens;
    meta.outputTokens += outputTokens;
    this.o.onUsage?.({
      model,
      feature: meta.feature,
      inputTokens,
      outputTokens,
      at: new Date(this.now()).toISOString(),
    });
    return { text: finalText(json ?? {}), json: json ?? {} };
  }
}

/** Validates a key by listing models (cheap; no generation). */
export { listModels as validateKey } from './discovery';
