import type { ModelInfo } from '@plantpal/schemas';
import { describe, expect, it } from 'vitest';
import {
  AiError,
  capabilitiesOf,
  classifyGeminiError,
  containsApiKey,
  listModels,
  looksLikeGeminiKey,
  pickModels,
  redactKeys,
} from '../src';
import { FAKE_AQ_KEY, FAKE_KEY, jsonResponse, replayFetch } from './helpers';

const quota = (quotaId: string, extra: object[] = []) => ({
  error: {
    code: 429,
    status: 'RESOURCE_EXHAUSTED',
    message: 'Quota exceeded',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [{ quotaId, quotaValue: '250' }],
      },
      ...extra,
    ],
  },
});

describe('error taxonomy', () => {
  it('classifies key, permission, billing, quota, rate and model errors distinctly', () => {
    expect(
      classifyGeminiError(400, {
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'API key not valid. Please pass a valid API key.',
          details: [{ reason: 'API_KEY_INVALID' }],
        },
      }).code,
    ).toBe('KEY_INVALID');
    expect(
      classifyGeminiError(403, {
        error: {
          status: 'PERMISSION_DENIED',
          message: 'Generative Language API has not been used in project',
        },
      }).code,
    ).toBe('PERMISSION_DENIED');
    expect(
      classifyGeminiError(400, { error: { message: 'User location is not supported for the API use.' } })
        .code,
    ).toBe('REGION_UNSUPPORTED');
    expect(classifyGeminiError(429, quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')).code).toBe(
      'DAILY_QUOTA',
    );
    const rate = classifyGeminiError(
      429,
      quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', [
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' },
      ]),
    );
    expect(rate.code).toBe('RATE_LIMITED');
    expect(rate.retryAfterMs).toBe(12_000);
    expect(rate.retryable).toBe(true);
    expect(
      classifyGeminiError(429, {
        error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0' },
      }).code,
    ).toBe('BILLING_REQUIRED');
    expect(
      classifyGeminiError(404, { error: { status: 'NOT_FOUND', message: 'models/x is not found' } }).code,
    ).toBe('MODEL_UNAVAILABLE');
    expect(classifyGeminiError(503, null).code).toBe('NETWORK');
  });

  it('Retry-After of 30 s is not retried automatically (Appendix B)', () => {
    const e = classifyGeminiError(429, { error: { message: 'Too many requests' } }, '30');
    expect(e.code).toBe('RATE_LIMITED');
    expect(e.retryAfterMs).toBe(30_000);
    expect(e.retryable).toBe(false);
  });

  it('marks key and quota problems as fixable in Settings', () => {
    expect(new AiError('KEY_MISSING', '').fixableInSettings).toBe(true);
    expect(new AiError('SAFETY_BLOCKED', '').fixableInSettings).toBe(false);
  });

  it('redacts anything shaped like a key, in either format', () => {
    expect(redactKeys(`oops ${FAKE_KEY} leaked`)).toBe('oops AIza…[redacted] leaked');
    expect(redactKeys(`oops ${FAKE_AQ_KEY} leaked`)).toBe('oops AQ.…[redacted] leaked');
    expect(containsApiKey(`key: ${FAKE_AQ_KEY}`)).toBe(true);
    expect(containsApiKey('Plant AQ. near the wall, then water.')).toBe(false);
  });

  it('accepts any plausible key before asking Google, whatever its prefix', () => {
    expect(looksLikeGeminiKey(FAKE_KEY)).toBe(true);
    expect(looksLikeGeminiKey(FAKE_AQ_KEY)).toBe(true);
    // A future format Google has not announced yet still goes to Google for the real check.
    expect(looksLikeGeminiKey('XY.' + 'k3y'.repeat(12))).toBe(true);
    expect(looksLikeGeminiKey(`  ${FAKE_AQ_KEY}\n`)).toBe(true);
    // Obvious paste mistakes are caught here.
    expect(looksLikeGeminiKey('sk-123')).toBe(false);
    expect(looksLikeGeminiKey(`"${FAKE_AQ_KEY}"`)).toBe(false);
    expect(looksLikeGeminiKey(`GEMINI_API_KEY ${FAKE_AQ_KEY}`)).toBe(false);
    expect(looksLikeGeminiKey('')).toBe(false);
  });
});

const model = (name: string, methods = ['generateContent', 'countTokens']): ModelInfo => ({
  name: `models/${name}`,
  displayName: name,
  version: null,
  inputTokenLimit: 1_000_000,
  outputTokenLimit: 65_536,
  methods,
});

describe('model discovery', () => {
  it('lists models with the key in a header, never in the URL, across pages', async () => {
    const { fetch, calls } = replayFetch([
      jsonResponse({
        models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }],
        nextPageToken: 'p2',
      }),
      jsonResponse({
        models: [{ name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }],
      }),
    ]);
    const models = await listModels(FAKE_KEY, { fetch });
    expect(models.map((m) => m.name)).toEqual(['models/gemini-3.5-flash', 'models/gemini-embedding-001']);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.url).not.toContain(FAKE_KEY);
      expect((c.init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY);
    }
    expect(calls[1]?.url).toContain('pageToken=p2');
  });

  it('a bad key surfaces as KEY_INVALID', async () => {
    const { fetch } = replayFetch([
      jsonResponse({ error: { code: 400, message: 'API key not valid.' } }, 400),
    ]);
    await expect(listModels(FAKE_KEY, { fetch })).rejects.toMatchObject({ code: 'KEY_INVALID' });
  });

  it('picks seeds when listed, prefers stable, allows preview for deep, honours overrides', () => {
    const models = [
      model('gemini-3.5-flash'),
      model('gemini-3.5-flash-lite'),
      model('gemini-3.6-flash-preview-11-2026'),
      model('gemini-3.1-pro-preview'),
      model('gemini-embedding-001', ['embedContent']),
      model('gemini-3.5-flash-native-audio', ['bidiGenerateContent']),
    ];
    const roles = pickModels(models);
    expect(roles).toMatchObject({
      balanced: 'gemini-3.5-flash',
      fast: 'gemini-3.5-flash-lite',
      deep: 'gemini-3.1-pro-preview',
      embed: 'gemini-embedding-001',
      live: 'gemini-3.5-flash-native-audio',
    });
    expect(roles.image).toBeUndefined();
    expect(pickModels(models, { balanced: 'gemini-3.6-flash-preview-11-2026' }).balanced).toBe(
      'gemini-3.6-flash-preview-11-2026',
    );
    // An override the key does not list is ignored.
    expect(pickModels(models, { balanced: 'gemini-9-flash' }).balanced).toBe('gemini-3.5-flash');
    expect(capabilitiesOf(roles)).toEqual({ text: true, vision: true, voice: true, image: false });
  });

  it('without seeds, takes the newest stable model in the family', () => {
    const roles = pickModels([
      model('gemini-2.0-flash'),
      model('gemini-4.0-flash'),
      model('gemini-4.1-flash-exp'),
    ]);
    expect(roles.balanced).toBe('gemini-4.0-flash');
  });
});
