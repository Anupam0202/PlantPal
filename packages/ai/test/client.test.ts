import { describe, expect, it } from 'vitest';
import {
  AiError,
  captureParseV1,
  GeminiClient,
  planExplainV1,
  type CaptureParseInput,
  type PlanExplainInput,
  type UsageRecord,
} from '../src';
import { FAKE_AQ_KEY, FAKE_KEY, geminiText, jsonResponse, replayFetch } from './helpers';

const policy = { locale: 'en', units: 'metric', seasonModel: 'monsoon' } as const;

const planInput: PlanExplainInput = {
  policy,
  place: 'Pune, IN',
  climate: 'Monsoon climate; no frost; hot dry spring.',
  spaces: ['West balcony, about 4 h direct sun, covered'],
  household: 'Cat in the household',
  goals: ['food'],
  candidates: [
    {
      taxonKey: 'ocimum-basilicum',
      commonName: 'Basil',
      scientificName: 'Ocimum basilicum',
      status: 'ELIGIBLE',
      reasons: ['4 h sun is enough'],
      warnings: [],
    },
    {
      taxonKey: 'coriandrum-sativum',
      commonName: 'Coriander',
      scientificName: 'Coriandrum sativum',
      status: 'ELIGIBLE',
      reasons: ['Cool season fits'],
      warnings: [],
    },
  ],
};

const goodPlan = {
  summary: 'Both herbs suit a covered west balcony with about 4 hours of sun.',
  perPlant: [
    {
      taxonKey: 'ocimum-basilicum',
      whyItFits: ['4 h of sun is enough'],
      watchOuts: ['Pinch flowers'],
      firstSteps: ['Check soil daily'],
    },
  ],
  extraSuggestions: [{ scientificName: 'Mentha spicata', reason: 'Tolerates part sun' }],
  unknowns: ['Pot sizes'],
};

function client(
  responses: Array<Response | Error>,
  extra: Partial<ConstructorParameters<typeof GeminiClient>[0]> = {},
) {
  const r = replayFetch(responses);
  const usage: UsageRecord[] = [];
  const slept: number[] = [];
  const c = new GeminiClient({
    getKey: async () => FAKE_KEY,
    roles: () => ({ balanced: 'gemini-3.5-flash', fast: 'gemini-3.5-flash-lite' }),
    fetch: r.fetch,
    sleep: async (ms) => void slept.push(ms),
    onUsage: (u) => usage.push(u),
    ...extra,
  });
  return { c, calls: r.calls, usage, slept };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request bodies are inspected loosely
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body)) as Record<string, any>;

describe('GeminiClient.generateStructured', () => {
  it('sends structured-output config, the policy and the key only in a header', async () => {
    const { c, calls, usage } = client([jsonResponse(geminiText(JSON.stringify(goodPlan)))]);
    const r = await c.generateStructured(planExplainV1, planInput);
    expect(r.data.perPlant[0]?.taxonKey).toBe('ocimum-basilicum');
    expect(r.meta).toMatchObject({
      feature: 'plan-explain',
      model: 'gemini-3.5-flash',
      attempts: 1,
      repaired: false,
      inputTokens: 100,
      outputTokens: 50,
    });
    const [call] = calls;
    expect(call!.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
    );
    expect(call!.url).not.toContain(FAKE_KEY);
    expect(String(call!.init.body)).not.toContain(FAKE_KEY);
    expect((call!.init.headers as Record<string, string>)['x-goog-api-key']).toBe(FAKE_KEY);
    expect(call!.init.credentials).toBe('omit');
    const body = bodyOf(call!.init);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.type).toBe('object');
    expect(body.generationConfig.responseJsonSchema.$schema).toBeUndefined();
    expect(body.systemInstruction.parts[0].text).toContain('Never: say a plant or plant part is edible');
    expect(body.systemInstruction.parts[0].text).toContain('season model (monsoon)');
    // Untrusted text is labelled as data.
    expect(JSON.stringify(body.contents)).toContain('<user_data source=\\"space\\">');
    expect(usage).toHaveLength(1);
  });

  it('no key → KEY_MISSING without any request', async () => {
    const { c, calls } = client([], { getKey: async () => null });
    await expect(c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'KEY_MISSING',
    });
    expect(calls).toHaveLength(0);
  });

  it('consent: a required category that is switched off blocks the call; optional ones are dropped', async () => {
    const { c, calls } = client([jsonResponse(geminiText(JSON.stringify(goodPlan)))]);
    await expect(
      c.generateStructured(planExplainV1, planInput, { allowed: new Set(['climate']) }),
    ).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    expect(calls).toHaveLength(0);
    await c.generateStructured(planExplainV1, planInput, { allowed: new Set(['plants']) });
    const sent = JSON.stringify(bodyOf(calls[0]!.init).contents);
    expect(sent).not.toContain('Pune');
    expect(sent).not.toContain('Monsoon climate');
  });

  it('repairs once with the validator errors, then gives SCHEMA_INVALID', async () => {
    const outside = { ...goodPlan, perPlant: [{ ...goodPlan.perPlant[0], taxonKey: 'lilium-candidum' }] };
    const ok = client([
      jsonResponse(geminiText(JSON.stringify(outside))),
      jsonResponse(geminiText(JSON.stringify(goodPlan))),
    ]);
    const r = await ok.c.generateStructured(planExplainV1, planInput);
    expect(r.meta.repaired).toBe(true);
    const repairBody = bodyOf(ok.calls[1]!.init);
    expect(repairBody.contents).toHaveLength(3);
    expect(repairBody.contents[2].parts[0].text).toContain('is not in the candidate list');

    const bad = client([
      jsonResponse(geminiText('{"summary": 1')),
      jsonResponse(geminiText(JSON.stringify(outside))),
    ]);
    await expect(bad.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'SCHEMA_INVALID',
    });
    expect(bad.calls).toHaveLength(2);
  });

  it('forbidden claims are rejected (edibility, pesticides, air purification, certainty)', async () => {
    for (const claim of [
      'Basil is non-toxic to cats.',
      'Spray neem oil weekly.',
      'It purifies the air.',
      'It will definitely thrive.',
    ]) {
      const bad = { ...goodPlan, summary: claim };
      const { c } = client([
        jsonResponse(geminiText(JSON.stringify(bad))),
        jsonResponse(geminiText(JSON.stringify(bad))),
      ]);
      await expect(c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
        code: 'SCHEMA_INVALID',
      });
    }
  });

  it('retries a short rate limit once after the wait; never more than 2 attempts', async () => {
    const limited = () =>
      jsonResponse(
        {
          error: {
            code: 429,
            message: 'Rate limit',
            details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '5s' }],
          },
        },
        429,
      );
    const ok = client([limited(), jsonResponse(geminiText(JSON.stringify(goodPlan)))]);
    await ok.c.generateStructured(planExplainV1, planInput);
    expect(ok.slept).toEqual([5000]);
    const fail = client([limited(), limited(), limited()]);
    await expect(fail.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(fail.calls).toHaveLength(2);
  });

  it('does not wait out a long Retry-After; quota and billing are not retried', async () => {
    const long = client([
      jsonResponse({ error: { code: 429, message: 'slow down' } }, 429, { 'retry-after': '30' }),
    ]);
    await expect(long.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      retryAfterMs: 30_000,
    });
    expect(long.calls).toHaveLength(1);
    const daily = client([
      jsonResponse(
        {
          error: {
            code: 429,
            message: 'Quota exceeded',
            details: [
              {
                violations: [
                  { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '250' },
                ],
              },
            ],
          },
        },
        429,
      ),
    ]);
    await expect(daily.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'DAILY_QUOTA',
    });
    expect(daily.calls).toHaveLength(1);
  });

  it('404 → re-discovers once and uses the new model; never hops through a list', async () => {
    let rediscoveries = 0;
    const notFound = () =>
      jsonResponse({ error: { code: 404, status: 'NOT_FOUND', message: 'not found' } }, 404);
    const r = client([notFound(), jsonResponse(geminiText(JSON.stringify(goodPlan)))], {
      rediscover: async () => (rediscoveries++, { balanced: 'gemini-3.6-flash' }),
    });
    const res = await r.c.generateStructured(planExplainV1, planInput);
    expect(res.meta.model).toBe('gemini-3.6-flash');
    expect(r.calls[1]!.url).toContain('gemini-3.6-flash:generateContent');
    const twice = client([notFound(), notFound(), notFound()], {
      rediscover: async () => ({ balanced: `gemini-${Math.random()}-flash` }),
    });
    await expect(twice.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    expect(twice.calls).toHaveLength(2);
    expect(rediscoveries).toBe(1);
  });

  it('maps finish reasons: truncation, safety, recitation and empty output', async () => {
    const cases: Array<[unknown, string]> = [
      [geminiText('{"summary": "cut', 'MAX_TOKENS'), 'OUTPUT_TRUNCATED'],
      [geminiText('', 'SAFETY'), 'SAFETY_BLOCKED'],
      [{ promptFeedback: { blockReason: 'OTHER' } }, 'SAFETY_BLOCKED'],
      [geminiText('x', 'RECITATION'), 'RECITATION'],
      [
        {
          candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] }, finishReason: 'STOP' }],
        },
        'NO_FINAL_OUTPUT',
      ],
    ];
    for (const [body, code] of cases) {
      const { c } = client([jsonResponse(body)]);
      await expect(c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({ code });
    }
  });

  it('network failure retries once; a timeout is TIMEOUT; an abort is CANCELLED', async () => {
    const net = client([new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
    await expect(net.c.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(net.calls).toHaveLength(2);

    const ac = new AbortController();
    ac.abort();
    const { c } = client([]);
    await expect(c.generateStructured(planExplainV1, planInput, { signal: ac.signal })).rejects.toMatchObject(
      { code: 'CANCELLED' },
    );

    const slow = new GeminiClient({
      getKey: async () => FAKE_KEY,
      roles: () => ({ balanced: 'gemini-3.5-flash' }),
      deadlineMs: 20,
      sleep: async () => undefined,
      fetch: ((_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))),
        )) as typeof fetch,
    });
    await expect(slow.generateStructured(planExplainV1, planInput)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('an unsupported thinking setting is dropped once without counting as an attempt', async () => {
    const captureInput: CaptureParseInput = {
      policy,
      text: 'watered basil 1 l',
      today: '2026-10-29',
      specimens: [{ id: 's1', name: 'Basil' }],
    };
    const out = {
      proposals: [
        {
          type: 'careEvent',
          specimenId: 's1',
          kind: 'water',
          amount: { value: 1, unit: 'l' },
          when: 'now',
          sourceSpan: 'watered basil 1 l',
        },
      ],
      unparsed: '',
    };
    const { c, calls } = client([
      jsonResponse(
        {
          error: {
            code: 400,
            status: 'INVALID_ARGUMENT',
            message: 'thinking_level is not supported for this model.',
          },
        },
        400,
      ),
      jsonResponse(geminiText(JSON.stringify(out))),
    ]);
    const r = await c.generateStructured(captureParseV1, captureInput);
    expect(r.meta.degraded).toEqual(['thinking']);
    expect(r.meta.attempts).toBe(1);
    expect(bodyOf(calls[0]!.init).generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    expect(bodyOf(calls[1]!.init).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('refuses to send a note that contains an API key (Appendix B)', async () => {
    const { c, calls } = client([]);
    const input: CaptureParseInput = {
      policy,
      text: `my key is ${FAKE_KEY}`,
      today: '2026-10-29',
      specimens: [],
    };
    const err = await c.generateStructured(captureParseV1, input).catch((e: AiError) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).opts.detail).toBe('API_KEY_IN_INPUT');
    expect(calls).toHaveLength(0);
  });

  it('refuses a note that contains a key in the newer AQ. format', async () => {
    const { c, calls } = client([]);
    const input: CaptureParseInput = {
      policy,
      text: `key ${FAKE_AQ_KEY}`,
      today: '2026-10-29',
      specimens: [],
    };
    const err = await c.generateStructured(captureParseV1, input).catch((e: AiError) => e);
    expect((err as AiError).opts.detail).toBe('API_KEY_IN_INPUT');
    expect(calls).toHaveLength(0);
  });

  it('refuses a note that contains the saved key, whatever its format', async () => {
    const unusual = 'zz' + '9Q'.repeat(15);
    const { c, calls } = client([], { getKey: async () => unusual });
    const input: CaptureParseInput = {
      policy,
      text: `paste: ${unusual}`,
      today: '2026-10-29',
      specimens: [],
    };
    const err = await c.generateStructured(captureParseV1, input).catch((e: AiError) => e);
    expect((err as AiError).opts.detail).toBe('API_KEY_IN_INPUT');
    expect(calls).toHaveLength(0);
  });
});

describe('response schema for Gemini', () => {
  it('uses only the documented subset', async () => {
    const { responseSchema } = await import('../src');
    const { CaptureProposals, PlanExplanation, AltText, PlainExplanation } =
      await import('@plantpal/schemas');
    const allowed = new Set([
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
    const walk = (n: unknown, inProps = false): void => {
      if (Array.isArray(n)) return n.forEach((x) => walk(x));
      if (!n || typeof n !== 'object') return;
      for (const [k, v] of Object.entries(n)) {
        if (!inProps) expect(allowed.has(k), k).toBe(true);
        walk(v, k === 'properties' && !inProps);
      }
    };
    for (const s of [CaptureProposals, PlanExplanation, AltText, PlainExplanation]) walk(responseSchema(s));
    const capture = JSON.stringify(responseSchema(CaptureProposals));
    expect(capture).toContain('"anyOf"');
    expect(capture).toContain('"enum":["careEvent"]');
    expect(capture).not.toContain('"type":["string","null"]');
    expect(capture).toContain('{"type":"null"}');
  });
});
