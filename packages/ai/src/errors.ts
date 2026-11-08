import type { AiErrorCode } from '@plantpal/schemas';

/**
 * Typed AI errors (§18.4). Each code has its own copy and recovery in the UI; "no key" is never shown
 * as "quota exceeded", and quota, auth and billing are never conflated.
 */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    readonly opts: { status?: number; retryAfterMs?: number | null; detail?: string } = {},
  ) {
    super(message);
    this.name = 'AiError';
  }

  get retryAfterMs(): number | null {
    return this.opts.retryAfterMs ?? null;
  }

  /**
   * Worth one more attempt (network trouble, server errors, short rate limits). A timeout is not:
   * asking the same slow model again only doubles the wait.
   */
  get retryable(): boolean {
    if (this.code === 'NETWORK') return true;
    if (this.code === 'RATE_LIMITED') return (this.retryAfterMs ?? 0) <= 20_000;
    return false;
  }

  /** The user can fix it in Settings › AI (key, project, billing); pending actions resume afterwards. */
  get fixableInSettings(): boolean {
    return [
      'KEY_MISSING',
      'KEY_INVALID',
      'PERMISSION_DENIED',
      'BILLING_REQUIRED',
      'SEARCH_UNAVAILABLE',
      'DAILY_QUOTA',
    ].includes(this.code);
  }
}

interface GoogleErrorDetail {
  '@type'?: string;
  reason?: string;
  retryDelay?: string;
  violations?: Array<{ quotaId?: string; quotaMetric?: string; quotaValue?: string }>;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; details?: GoogleErrorDetail[] };
}

function retryDelayMs(details: GoogleErrorDetail[]): number | null {
  const d = details.find((x) => x['@type']?.endsWith('RetryInfo'))?.retryDelay;
  if (!d) return null;
  const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

/** Marks a 429 that names no quota and gives no retry time (see classifyGeminiError). */
export const NO_QUOTA_DETAIL = 'NO_QUOTA_DETAIL';

/** Maps a Gemini API error response to the taxonomy. */
export function classifyGeminiError(
  status: number,
  body: unknown,
  retryAfterHeader?: string | null,
): AiError {
  const e = (body as GoogleErrorBody | null)?.error ?? {};
  const details = Array.isArray(e.details) ? e.details : [];
  const msg = e.message ?? `HTTP ${status}`;
  const reasons = details.map((d) => d.reason ?? '').join(' ');
  const text = `${msg} ${reasons}`.toLowerCase();
  const headerMs =
    retryAfterHeader && /^\d+$/.test(retryAfterHeader) ? Number(retryAfterHeader) * 1000 : null;
  const retryAfterMs = retryDelayMs(details) ?? headerMs;

  if (
    text.includes('api_key_invalid') ||
    text.includes('api key not valid') ||
    text.includes('api key expired')
  )
    return new AiError('KEY_INVALID', msg, { status });
  if (status === 400 && text.includes('location is not supported'))
    return new AiError('REGION_UNSUPPORTED', msg, { status });
  if (status === 403 || e.status === 'PERMISSION_DENIED') {
    return new AiError(text.includes('billing') ? 'BILLING_REQUIRED' : 'PERMISSION_DENIED', msg, { status });
  }
  if (status === 429 || e.status === 'RESOURCE_EXHAUSTED') {
    const quotaIds = details
      .flatMap((d) => d.violations ?? [])
      .map((v) => `${v.quotaId ?? ''} ${v.quotaValue ?? ''}`.toLowerCase());
    // A free-tier limit of 0 means the model needs a billed project.
    if (text.includes('limit: 0') || quotaIds.some((q) => /\s0$/.test(q)))
      return new AiError('BILLING_REQUIRED', msg, { status });
    if (quotaIds.some((q) => q.includes('perday')) || text.includes('per day'))
      return new AiError('DAILY_QUOTA', msg, { status, retryAfterMs });
    // A quota refusal that names no quota and gives no time to wait: how Google turns down a feature
    // the key's plan does not include, such as web search on the free tier.
    const bare = quotaIds.length === 0 && retryAfterMs === null;
    return new AiError('RATE_LIMITED', msg, {
      status,
      retryAfterMs: retryAfterMs ?? 30_000,
      ...(bare ? { detail: NO_QUOTA_DETAIL } : {}),
    });
  }
  if (status === 400 && text.includes('billing')) return new AiError('BILLING_REQUIRED', msg, { status });
  if (status === 404 || e.status === 'NOT_FOUND') return new AiError('MODEL_UNAVAILABLE', msg, { status });
  if (status >= 500) return new AiError('NETWORK', msg, { status, retryAfterMs });
  return new AiError('SCHEMA_INVALID', msg, { status, detail: e.status });
}

/**
 * Leak-guard heuristic, kept in this one place: the shapes Google API keys have had so far (older
 * `AIza…` keys and the `AQ.…` keys AI Studio issues now). It only helps keep key-like text out of
 * prompts, logs and builds; the real guard compares against the person's actual saved key. It is
 * never used to decide whether a key is valid: Google decides that.
 */
const KEY_SOURCE = String.raw`AIza[0-9A-Za-z_-]{35}|AQ\.[0-9A-Za-z_-]{30,}`;

/** A new global pattern that matches key-shaped strings. */
export function apiKeyPattern(): RegExp {
  return new RegExp(KEY_SOURCE, 'g');
}

/** True when the text contains anything shaped like a Google API key. */
export function containsApiKey(text: string): boolean {
  return new RegExp(KEY_SOURCE).test(text);
}

/** Removes anything shaped like a Google API key from text (defence in depth for logs and reports). */
export function redactKeys(text: string): string {
  return text.replace(apiKeyPattern(), (k) => `${k.startsWith('AQ.') ? 'AQ.' : 'AIza'}…[redacted]`);
}

/** No API key is anywhere near this long; anything longer is a paste of something else. */
export const MAX_KEY_LENGTH = 4096;

export type KeyInputProblem = 'empty' | 'spaces' | 'too-long';

/**
 * The only checks made before asking Google, after trimming: something was entered, it is one piece
 * (no spaces or line breaks inside) and it is not absurdly long. No prefix, length or character
 * rules: key formats change (`AIza…`, then `AQ.…`), and whether a key works is Google's answer.
 */
export function keyInputProblem(value: string): KeyInputProblem | null {
  const key = value.trim();
  if (!key) return 'empty';
  if (/\s/.test(key)) return 'spaces';
  if (key.length > MAX_KEY_LENGTH) return 'too-long';
  return null;
}
