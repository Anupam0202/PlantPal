import type { ModelInfo } from '@plantpal/schemas';
import { describe, expect, it } from 'vitest';
import {
  AiError,
  capabilitiesOf,
  classifyGeminiError,
  containsApiKey,
  discoverModels,
  keyInputProblem,
  listModels,
  MAX_KEY_LENGTH,
  NO_QUOTA_DETAIL,
  pickModels,
  probeModel,
  redactKeys,
  textModels,
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

  it('marks a quota refusal that names no quota and gives no wait, and only that one', () => {
    const bare = classifyGeminiError(429, {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota, please check your plan and billing details.',
      },
    });
    expect(bare.code).toBe('RATE_LIMITED');
    expect(bare.opts.detail).toBe(NO_QUOTA_DETAIL);
    const timed = classifyGeminiError(
      429,
      quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', [
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '12s' },
      ]),
    );
    expect(timed.opts.detail).toBeUndefined();
  });

  it('retries network trouble but not a timeout, which would only double the wait', () => {
    expect(new AiError('NETWORK', '').retryable).toBe(true);
    expect(new AiError('TIMEOUT', '').retryable).toBe(false);
  });

  it('marks key and quota problems as fixable in Settings', () => {
    expect(new AiError('KEY_MISSING', '').fixableInSettings).toBe(true);
    expect(new AiError('SEARCH_UNAVAILABLE', '').fixableInSettings).toBe(true);
    expect(new AiError('SAFETY_BLOCKED', '').fixableInSettings).toBe(false);
  });

  it('redacts anything shaped like a key, in either format', () => {
    expect(redactKeys(`oops ${FAKE_KEY} leaked`)).toBe('oops AIza…[redacted] leaked');
    expect(redactKeys(`oops ${FAKE_AQ_KEY} leaked`)).toBe('oops AQ.…[redacted] leaked');
    expect(containsApiKey(`key: ${FAKE_AQ_KEY}`)).toBe(true);
    expect(containsApiKey('Plant AQ. near the wall, then water.')).toBe(false);
  });

  it('leaves the format of a key to Google: only empty, spaced or absurdly long input is stopped', () => {
    expect(keyInputProblem(FAKE_KEY)).toBeNull();
    expect(keyInputProblem(FAKE_AQ_KEY)).toBeNull();
    expect(keyInputProblem(`  ${FAKE_AQ_KEY}\n`)).toBeNull();
    // Formats Google has not announced: any prefix, length or characters still go to Google.
    for (const future of [
      'XY.' + 'k3y'.repeat(12),
      'sk-123',
      'gk_live/Ab+Cd=Ef~09',
      'Ünï.códe',
      `"${FAKE_AQ_KEY}"`,
    ])
      expect(keyInputProblem(future)).toBeNull();
    expect(keyInputProblem('')).toBe('empty');
    expect(keyInputProblem(' \n\t ')).toBe('empty');
    expect(keyInputProblem(`GEMINI_API_KEY ${FAKE_AQ_KEY}`)).toBe('spaces');
    expect(keyInputProblem(`${FAKE_KEY}\n${FAKE_AQ_KEY}`)).toBe('spaces');
    expect(keyInputProblem('k'.repeat(MAX_KEY_LENGTH))).toBeNull();
    expect(keyInputProblem('k'.repeat(MAX_KEY_LENGTH + 1))).toBe('too-long');
  });
});

const model = (
  name: string,
  methods = ['generateContent', 'countTokens'],
  extra: Partial<ModelInfo> = {},
): ModelInfo => ({
  name: `models/${name}`,
  displayName: name,
  version: null,
  inputTokenLimit: 1_000_000,
  outputTokenLimit: 65_536,
  methods,
  thinking: true,
  ...extra,
});

/** Model list entries as the API returns them. */
const raw = (name: string, extra: Record<string, unknown> = {}) => ({
  name: `models/${name}`,
  supportedGenerationMethods: ['generateContent', 'countTokens'],
  inputTokenLimit: 1_048_576,
  outputTokenLimit: 65_536,
  thinking: true,
  ...extra,
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

describe('model choice without relying on names', () => {
  it('picks working roles when no model name follows a known pattern', () => {
    const models = [
      model('orbit-voice', ['generateContent'], {
        inputTokenLimit: 8_192,
        outputTokenLimit: 16_384,
        thinking: null,
      }),
      model('orbit-2-preview'),
      model('orbit-2'),
      model('orbit-mini', ['generateContent'], { inputTokenLimit: 131_072, thinking: false }),
      model('vec-9', ['embedContent'], { outputTokenLimit: 1, thinking: null }),
      model('talk-9', ['bidiGenerateContent']),
    ];
    const roles = pickModels(models);
    expect(roles).toMatchObject({
      balanced: 'orbit-2',
      fast: 'orbit-2',
      deep: 'orbit-2',
      embed: 'vec-9',
      live: 'talk-9',
    });
    expect(roles.image).toBeUndefined();
    expect(capabilitiesOf(roles)).toMatchObject({ text: true, vision: true });
    // The person can pick any text model; the capability ranking puts the best first.
    expect(textModels(models).map((m) => m.name)).toEqual([
      'models/orbit-2',
      'models/orbit-2-preview',
      'models/orbit-mini',
      'models/orbit-voice',
    ]);
    expect(pickModels(models, { fast: 'orbit-mini' }).fast).toBe('orbit-mini');
  });

  it('special-purpose models are a last resort, and hidden while anything else is listed', () => {
    const models = [
      model('gemini-9-flash-image'),
      model('gemini-9-flash-tts', ['generateContent'], { inputTokenLimit: 8_192, thinking: null }),
      model('gemma-9-it', ['generateContent'], { inputTokenLimit: 262_144 }),
    ];
    expect(pickModels(models).balanced).toBe('gemma-9-it');
    expect(textModels(models).map((m) => m.name)).toEqual(['models/gemma-9-it']);
    expect(pickModels([model('gemini-9-flash-image')]).fast).toBe('gemini-9-flash-image');
  });

  it('never picks a model that was found unusable', () => {
    const models = [model('gemini-3.5-flash'), model('gemini-3.8-flash'), model('gemini-2.5-flash')];
    // gemini-2.5-flash is listed but closed to new keys, so it is no longer a seed.
    expect(pickModels([model('gemini-2.5-flash')]).balanced).toBe('gemini-2.5-flash');
    expect(pickModels(models).balanced).toBe('gemini-3.5-flash');
    expect(pickModels(models, {}, ['gemini-3.5-flash']).balanced).toBe('gemini-3.8-flash');
    expect(pickModels(models, { balanced: 'gemini-2.5-flash' }, ['models/gemini-2.5-flash']).balanced).toBe(
      'gemini-3.5-flash',
    );
    expect(pickModels(models, {}, ['gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'])).toEqual({});
  });
});

describe('checking a key with Google', () => {
  const okReply = () =>
    jsonResponse({ candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] });
  const gone = () =>
    jsonResponse(
      {
        error: { code: 404, status: 'NOT_FOUND', message: 'This model is no longer available to new users.' },
      },
      404,
    );

  it('the test request is tiny, carries the key only in a header and accepts any answer', async () => {
    const { fetch, calls } = replayFetch([
      jsonResponse({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }),
    ]);
    await probeModel(FAKE_AQ_KEY, 'models/nova-1', { fetch });
    expect(calls[0]!.url).toMatch(/\/models\/nova-1:generateContent$/);
    expect(calls[0]!.url).not.toContain(FAKE_AQ_KEY);
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_AQ_KEY);
    const body = JSON.parse(String(calls[0]!.init.body)) as { generationConfig: Record<string, unknown> };
    expect(body.generationConfig).toEqual({ maxOutputTokens: 16 });
  });

  it('a listed model that is closed to the key is left out and the next one tried', async () => {
    const { fetch, calls } = replayFetch([
      jsonResponse({ models: [raw('gemini-3.5-flash'), raw('gemini-3.8-flash')] }),
      gone(),
      okReply(),
    ]);
    const d = await discoverModels(FAKE_KEY, { fetch });
    expect(d.roles.balanced).toBe('gemini-3.8-flash');
    expect(d.unusable).toEqual(['gemini-3.5-flash']);
    expect(d.available).toEqual(['gemini-3.8-flash']);
    expect(d.unverified).toBeNull();
    expect(calls.map((c) => c.url.replace(/^.*\/v1beta/, ''))).toEqual([
      '/models?pageSize=1000',
      '/models/gemini-3.5-flash:generateContent',
      '/models/gemini-3.8-flash:generateContent',
    ]);
  });

  it('a model that needs billing is skipped like one that is gone; tries are capped', async () => {
    const billing = () =>
      jsonResponse(
        { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded, limit: 0' } },
        429,
      );
    const names = ['m-1', 'm-22', 'm-333', 'm-4444'];
    const { fetch, calls } = replayFetch([
      jsonResponse({ models: names.map((n) => raw(n)) }),
      billing(),
      gone(),
      billing(),
    ]);
    await expect(discoverModels(FAKE_KEY, { fetch })).rejects.toMatchObject({ code: 'BILLING_REQUIRED' });
    expect(calls).toHaveLength(4);
  });

  it('a passing rate limit or network failure on the test request still saves the key', async () => {
    const rate = replayFetch([
      jsonResponse({ models: [raw('nova-1')] }),
      jsonResponse({ error: { code: 429, message: 'Too many requests' } }, 429, { 'retry-after': '20' }),
    ]);
    const d = await discoverModels(FAKE_KEY, { fetch: rate.fetch });
    expect(d.roles.balanced).toBe('nova-1');
    expect(d.unverified).toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: 20_000 });
    const offline = replayFetch([
      jsonResponse({ models: [raw('nova-1')] }),
      new TypeError('Failed to fetch'),
    ]);
    expect((await discoverModels(FAKE_KEY, { fetch: offline.fetch })).unverified).toMatchObject({
      code: 'NETWORK',
    });
    // A slow model does not hold the check up: past the deadline the key is saved unverified.
    const hang = (async (url: string, init: RequestInit = {}) =>
      String(url).includes('/models?')
        ? jsonResponse({ models: [raw('nova-1')] })
        : new Promise((_r, reject) =>
            init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
          )) as typeof fetch;
    await expect(probeModel(FAKE_KEY, 'nova-1', { fetch: hang, deadlineMs: 20 })).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('a wrong key, a blocked project or an unsupported region stop the check with their own error', async () => {
    const bad = replayFetch([jsonResponse({ error: { code: 400, message: 'API key not valid.' } }, 400)]);
    await expect(discoverModels(FAKE_KEY, { fetch: bad.fetch })).rejects.toMatchObject({
      code: 'KEY_INVALID',
    });
    expect(bad.calls).toHaveLength(1);
    const denied = replayFetch([
      jsonResponse({ models: [raw('nova-1')] }),
      jsonResponse({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'API not enabled' } }, 403),
    ]);
    await expect(discoverModels(FAKE_KEY, { fetch: denied.fetch })).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    const region = replayFetch([
      jsonResponse({ models: [raw('nova-1')] }),
      jsonResponse({ error: { code: 400, message: 'User location is not supported for the API use.' } }, 400),
    ]);
    await expect(discoverModels(FAKE_KEY, { fetch: region.fetch })).rejects.toMatchObject({
      code: 'REGION_UNSUPPORTED',
    });
  });

  it('a key that lists no text model is told so, without a test request', async () => {
    const { fetch, calls } = replayFetch([
      jsonResponse({ models: [raw('vec-1', { supportedGenerationMethods: ['embedContent'] })] }),
    ]);
    await expect(discoverModels(FAKE_KEY, { fetch })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    expect(calls).toHaveLength(1);
  });
});
