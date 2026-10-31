import type { AiErrorCode } from '@plantpal/schemas';

/**
 * Typed AI errors (§18.4). Each code has its own copy and recovery in the UI; "no key" is never shown
 * as "quota exceeded" (L02), and quota, auth and billing are never conflated (L03).
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

  /** Worth one more attempt (network trouble, server errors, short rate limits). */
  get retryable(): boolean {
    if (this.code === 'NETWORK' || this.code === 'TIMEOUT') return true;
    if (this.code === 'RATE_LIMITED') return (this.retryAfterMs ?? 0) <= 20_000;
    return false;
  }

  /** The user can fix it in Settings › AI (key, project, billing); pending actions resume afterwards. */
  get fixableInSettings(): boolean {
    return ['KEY_MISSING', 'KEY_INVALID', 'PERMISSION_DENIED', 'BILLING_REQUIRED', 'DAILY_QUOTA'].includes(
      this.code,
    );
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
    return new AiError('RATE_LIMITED', msg, { status, retryAfterMs: retryAfterMs ?? 30_000 });
  }
  if (status === 400 && text.includes('billing')) return new AiError('BILLING_REQUIRED', msg, { status });
  if (status === 404 || e.status === 'NOT_FOUND') return new AiError('MODEL_UNAVAILABLE', msg, { status });
  if (status >= 500) return new AiError('NETWORK', msg, { status, retryAfterMs });
  return new AiError('SCHEMA_INVALID', msg, { status, detail: e.status });
}

const KEY_RE = /AIza[0-9A-Za-z_-]{35}/g;

/** Removes anything shaped like a Google API key from text (defence in depth for logs and reports). */
export function redactKeys(text: string): string {
  return text.replace(KEY_RE, 'AIza…[redacted]');
}

export function looksLikeGeminiKey(value: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(value.trim());
}
