import { describe, expect, it } from 'vitest';
import {
  consentedSections,
  GeminiClient,
  healthTriageV1,
  photoIdV1,
  speciesDraftV1,
  speciesResearchV1,
  type HealthTriageInput,
} from '../src';
import { FAKE_KEY, jsonResponse, replayFetch } from './helpers';

const policy = { locale: 'en', units: 'metric', seasonModel: 'temperate' } as const;
const img = { mimeType: 'image/jpeg' as const, data: 'AAAA' };
const healthIn: HealthTriageInput = {
  policy,
  photos: [{ label: 'Whole plant', image: img }],
  plant: 'Basil',
  answers: ['Signs: wilting', 'Soil at 2 cm: dry'],
  ruleCandidates: ['Too little water (LIKELY)'],
  notes: null,
  weather: null,
  careLog: null,
  space: null,
};
const triage = (over: Record<string, unknown> = {}) => ({
  imageUsable: true,
  plantPresent: true,
  identityGuess: { name: 'Basil', likelihood: 'LIKELY' },
  candidates: [
    {
      category: 'abiotic',
      name: 'Too little water',
      likelihood: 'LIKELY',
      evidenceFor: ['Wilting with dry soil'],
      evidenceAgainst: [],
      checksToConfirm: ['Does it recover after watering?'],
    },
  ],
  immediateSafeSteps: ['Water slowly until it drains.'],
  escalate: { needed: false, reason: 'Not needed now.' },
  followUpDays: [3, 7],
  abstainReason: null,
  ...over,
});

describe('F4 health triage validator', () => {
  const v = (o: Record<string, unknown>) => healthTriageV1.validate(triage(o) as never, healthIn);
  it('accepts a careful answer', () => expect(v({})).toEqual([]));
  it('requires abstention when the photo is unusable or shows no plant', () => {
    expect(v({ plantPresent: false })).not.toEqual([]);
    expect(v({ plantPresent: false, candidates: [], abstainReason: 'This is a photo of a cat.' })).toEqual(
      [],
    );
    expect(v({ candidates: [] })).not.toEqual([]);
  });
  it('rejects percentages, chemical first steps, products and certainty', () => {
    expect(v({ immediateSafeSteps: ['Spray a fungicide weekly.'] }).join()).toMatch(/non-chemical/);
    expect(
      v({
        abstainReason: null,
        candidates: [{ ...triage().candidates[0], evidenceFor: ['80% sure'] }],
      }).join(),
    ).toMatch(/percentages/);
    expect(v({ immediateSafeSteps: ['Use neem oil.'] }).join()).toMatch(/pesticide/);
    expect(v({ escalate: { needed: false, reason: 'It is definitely root rot.' } }).join()).toMatch(
      /certainty/,
    );
  });
  it('photos are required: switching them off means nothing is sent', () => {
    const { blockedBy } = consentedSections(healthTriageV1.sections(healthIn), new Set(['plants']));
    expect(blockedBy).toEqual(['photos']);
  });
});

describe('F5 photo ID validator', () => {
  const input = { policy, image: img, region: 'India', hint: null };
  const ok = {
    imageUsable: true,
    candidates: [
      {
        scientificName: 'Ocimum tenuiflorum',
        commonName: 'Holy basil',
        likelihood: 'LIKELY',
        features: ['Purple stems'],
        lookAlikes: ['Ocimum basilicum'],
      },
    ],
    abstainReason: null,
  };
  it('needs scientific names and refuses edibility', () => {
    expect(photoIdV1.validate(ok as never, input)).toEqual([]);
    expect(
      photoIdV1
        .validate(
          { ...ok, candidates: [{ ...ok.candidates[0], scientificName: 'holy basil plant' }] } as never,
          input,
        )
        .join(),
    ).toMatch(/not a scientific name/);
    expect(
      photoIdV1
        .validate(
          { ...ok, candidates: [{ ...ok.candidates[0], features: ['The leaves are edible'] }] } as never,
          input,
        )
        .join(),
    ).toMatch(/edibility/);
    expect(
      photoIdV1.validate({ imageUsable: false, candidates: [], abstainReason: 'Too blurry' } as never, input),
    ).toEqual([]);
  });
});

describe('F3 species draft', () => {
  const sources = [{ url: 'https://example.org/basil', title: 'Example extension sheet' }];
  const input = {
    policy,
    scientificName: 'Ocimum basilicum',
    prose: 'Basil is killed by frost below 0 °C [1].',
    sources,
  };
  it('every citation must come from the grounding sources', () => {
    const draft = (url: string) => ({
      traits: [
        { trait: 'minTempC', value: 0, unit: '°C', appliesTo: null, citations: [{ url, title: 'x' }] },
      ],
      cannotDetermine: [],
    });
    expect(speciesDraftV1.validate(draft('https://example.org/basil') as never, input)).toEqual([]);
    expect(speciesDraftV1.validate(draft('https://invented.example/page') as never, input).join()).toMatch(
      /not in the source list/,
    );
  });

  it('grounded research asks for Google Search and keeps only https grounding sources, deduplicated', async () => {
    const r = replayFetch([
      jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: 'Basil is frost tender.' }] },
            finishReason: 'STOP',
            groundingMetadata: {
              groundingChunks: [
                {
                  web: {
                    uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc',
                    title: 'extension.example.edu',
                  },
                },
                {
                  web: {
                    uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc',
                    title: 'dup',
                  },
                },
                { web: { uri: 'http://insecure.example', title: 'insecure' } },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
      }),
    ]);
    const c = new GeminiClient({
      getKey: async () => FAKE_KEY,
      roles: () => ({ balanced: 'gemini-3.5-flash' }),
      fetch: r.fetch,
    });
    const out = await c.generateGrounded(speciesResearchV1, {
      policy,
      scientificName: 'Ocimum basilicum',
      family: 'Lamiaceae',
    });
    expect(out.text).toBe('Basil is frost tender.');
    expect(out.sources).toEqual([
      {
        url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc',
        title: 'extension.example.edu',
      },
    ]);
    const body = JSON.parse(String(r.calls[0]!.init.body));
    expect(body.tools).toEqual([{ google_search: {} }]);
    expect(body.generationConfig.responseJsonSchema).toBeUndefined();
    expect(r.calls[0]!.url).not.toContain(FAKE_KEY);
  });

  it('grounded research keeps the error taxonomy (billing for grounding)', async () => {
    const r = replayFetch([
      jsonResponse({ error: { code: 429, message: 'Quota exceeded for metric: grounding, limit: 0' } }, 429),
    ]);
    const c = new GeminiClient({
      getKey: async () => FAKE_KEY,
      roles: () => ({ balanced: 'gemini-3.5-flash' }),
      fetch: r.fetch,
    });
    await expect(
      c.generateGrounded(speciesResearchV1, { policy, scientificName: 'x', family: null }),
    ).rejects.toMatchObject({ code: 'BILLING_REQUIRED' });
  });
});
