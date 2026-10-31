import type { Context } from 'hono';
import type { Problem } from '@plantpal/schemas';

const TITLES: Record<Problem['code'], string> = {
  VALIDATION_FAILED: 'The request is not valid',
  UNAUTHENTICATED: 'Sign-in required',
  FORBIDDEN: 'Not allowed',
  NOT_FOUND: 'Not found',
  VERSION_CONFLICT: 'Changed elsewhere',
  IDEMPOTENCY_CONFLICT: 'Idempotency key reused with a different request',
  RATE_LIMITED: 'Too many requests',
  QUOTA_EXHAUSTED: 'Quota exhausted',
  PROVIDER_UNAVAILABLE: 'Data source unavailable',
  PROVIDER_STALE: 'Data source is stale',
  CONSENT_REQUIRED: 'Consent required',
  CONFIGURATION_REQUIRED: 'Configuration required',
  SNAPSHOT_REQUIRED: 'Snapshot required',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA: 'Unsupported media type',
};

/** RFC 9457 `application/problem+json` response with a stable code and a non-sensitive trace id. */
export function problem(
  c: Context,
  status: number,
  code: Problem['code'],
  detail?: string,
  extra: { retryAfterSeconds?: number } = {},
): Response {
  const body: Problem = {
    type: `https://plantpal.app/problems/${code.toLowerCase().replaceAll('_', '-')}`,
    title: TITLES[code],
    status,
    code,
    traceId: (c.get('traceId' as never) as string | undefined) ?? 'unknown',
    ...(detail ? { detail } : {}),
    ...(extra.retryAfterSeconds !== undefined ? { retryAfterSeconds: extra.retryAfterSeconds } : {}),
  };
  const headers: Record<string, string> = { 'content-type': 'application/problem+json' };
  if (extra.retryAfterSeconds !== undefined) headers['retry-after'] = String(extra.retryAfterSeconds);
  return new Response(JSON.stringify(body), { status, headers });
}
