import type { Page } from '@playwright/test';
import { expect } from './helpers';

/** A key-shaped test value built at runtime (no key-like literal is committed). */
export const KEY = 'AIza' + 'Sy' + 'E2E'.repeat(11);
export const GEMINI = 'https://generativelanguage.googleapis.com/';

const MODELS = [
  {
    name: 'models/gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    supportedGenerationMethods: ['generateContent', 'countTokens'],
  },
  {
    name: 'models/gemini-3.5-flash-lite',
    displayName: 'Gemini 3.5 Flash-Lite',
    supportedGenerationMethods: ['generateContent'],
  },
  {
    name: 'models/gemini-3.1-pro-preview',
    displayName: 'Gemini 3.1 Pro',
    supportedGenerationMethods: ['generateContent'],
  },
  {
    name: 'models/gemini-embedding-001',
    displayName: 'Embedding',
    supportedGenerationMethods: ['embedContent'],
  },
];

type Mode = 'ok' | 'rate-limited' | 'truncated' | 'not-a-plant';

/** Answers Gemini like the real API would, from what the request actually asked for. */
export async function mockGemini(page: Page) {
  const state = {
    mode: 'ok' as Mode,
    generateCalls: 0,
    lastImages: 0,
    signatureEchoed: false,
    streamUrls: [] as string[],
  };
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-goog-api-key',
    'access-control-allow-methods': 'GET, POST',
    'content-type': 'application/json',
  };
  await page.route(`${GEMINI}**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (req.headers()['x-goog-api-key'] !== KEY)
      return route.fulfill({
        status: 400,
        headers: cors,
        body: JSON.stringify({
          error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT' },
        }),
      });
    if (req.url().includes('/models?'))
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ models: MODELS }) });
    if (req.url().includes(':streamGenerateContent')) {
      // Garden Copilot (F6): a scripted tool loop over server-sent events.
      state.generateCalls++;
      state.streamUrls.push(req.url());
      const body = JSON.parse(req.postData() ?? '{}') as {
        contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
      };
      if (
        body.contents.some((c) => c.role === 'model' && c.parts.some((p) => p.thoughtSignature === 'e2e-sig'))
      )
        state.signatureEchoed = true;
      const fr = body.contents.at(-1)?.parts.find((p) => p.functionResponse)?.functionResponse as
        { name: string; response: { result?: { plants?: Array<{ id: string; name: string }> } } } | undefined;
      const callChunk = (name: string, args: Record<string, unknown>) => ({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name, args }, thoughtSignature: 'e2e-sig' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 20 },
      });
      const textChunks = (t: string) =>
        t.split(/(?<= )/).map((w, i, a) => ({
          candidates: [
            {
              content: { role: 'model', parts: [{ text: w }] },
              ...(i === a.length - 1 ? { finishReason: 'STOP' } : {}),
            },
          ],
        }));
      let chunks: unknown[];
      if (!fr) chunks = [callChunk('get_garden_overview', {})];
      else if (fr.name === 'get_garden_overview') {
        const plant = fr.response.result?.plants?.[0];
        chunks = plant
          ? [
              callChunk('propose_care_event', {
                specimenId: plant.id,
                kind: 'water',
                amountMl: 500,
                notes: 'From the Copilot',
              }),
            ]
          : textChunks('You have no plants yet.');
      } else
        chunks = textChunks('I suggested logging 500 ml of water. What I don’t know: how dry the soil is.');
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'text/event-stream' },
        body: chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join(''),
      });
    }
    state.generateCalls++;
    if (state.mode === 'rate-limited')
      return route.fulfill({
        status: 429,
        headers: { ...cors, 'retry-after': '30' },
        body: JSON.stringify({
          error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' },
        }),
      });
    const body = JSON.parse(req.postData() ?? '{}') as {
      systemInstruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ text?: string; inlineData?: unknown }> }>;
      tools?: unknown[];
    };
    state.lastImages = body.contents.flatMap((c) => c.parts.filter((p) => p.inlineData)).length;
    const reply = (payload: unknown, finishReason = 'STOP', extra: Record<string, unknown> = {}) =>
      route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] },
              finishReason,
              ...extra,
            },
          ],
          usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 120 },
        }),
      });
    if (body.tools) {
      // Grounded research (F3 step 1): prose plus web sources in the grounding metadata.
      return reply(
        'Chia (Salvia hispanica) is an annual killed by frost [1]. It grows to about 1.75 m [2].',
        'STOP',
        {
          groundingMetadata: {
            groundingChunks: [
              {
                web: {
                  uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/aaa',
                  title: 'extension.example.edu',
                },
              },
              {
                web: {
                  uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/bbb',
                  title: 'kew.org',
                },
              },
            ],
          },
        },
      );
    }
    const system = body.systemInstruction.parts[0]?.text ?? '';
    const text = body.contents.flatMap((c) => c.parts.map((p) => p.text ?? '')).join('\n');
    let out: unknown;
    if (system.includes('candidate plants')) {
      const keys = [...text.matchAll(/"taxonKey": "([a-z0-9-]+)"/g)].map((m) => m[1]);
      out = {
        summary: 'These plants suit this balcony and its sun.',
        perPlant: keys.slice(0, 2).map((taxonKey) => ({
          taxonKey,
          whyItFits: ['Enough direct sun here'],
          watchOuts: ['Check the pot drains freely'],
          firstSteps: ['Check soil at 2 cm every other day'],
        })),
        extraSuggestions: [{ scientificName: 'Lantana camara', reason: 'Butterflies visit it' }],
        unknowns: ['Pot sizes'],
      };
    } else if (system.includes('gardener’s note')) {
      const plant = /\n([0-9A-Z]{26})\t/.exec(text)?.[1] ?? null;
      const note = /### Note\n<user_data source="journal">\n([\s\S]*?)\n<\/user_data>/.exec(text)?.[1] ?? '';
      out = {
        proposals: [
          {
            type: 'careEvent',
            specimenId: plant,
            kind: 'water',
            amount: { value: 1, unit: 'l' },
            when: 'now',
            sourceSpan: note,
          },
        ],
        unparsed: '',
      };
    } else if (system.includes('triage a possible plant health problem')) {
      if (state.mode === 'truncated')
        return reply(
          '{"imageUsable": true, "plantPresent": true, "candidates": [{"category": "abio',
          'MAX_TOKENS',
        );
      out =
        state.mode === 'not-a-plant'
          ? {
              imageUsable: true,
              plantPresent: false,
              identityGuess: null,
              candidates: [],
              immediateSafeSteps: [],
              escalate: { needed: false, reason: 'No plant to assess.' },
              followUpDays: [],
              abstainReason: 'The photos show a floor, not a plant.',
            }
          : {
              imageUsable: true,
              plantPresent: true,
              identityGuess: { name: 'Basil', likelihood: 'POSSIBLE' },
              candidates: [
                {
                  category: 'abiotic',
                  name: 'Underwatering in summer heat',
                  likelihood: 'LIKELY',
                  evidenceFor: ['Leaves curling at the edges'],
                  evidenceAgainst: [],
                  checksToConfirm: ['Does it recover overnight after watering?'],
                },
              ],
              immediateSafeSteps: ['Water slowly until it drains and move it out of afternoon sun.'],
              escalate: { needed: false, reason: 'Not needed now.' },
              followUpDays: [2, 5],
              abstainReason: null,
            };
    } else if (system.includes('suggest what plant this photo shows')) {
      out = {
        imageUsable: true,
        candidates: [
          {
            scientificName: 'Ocimum tenuiflorum',
            commonName: 'Holy basil',
            likelihood: 'LIKELY',
            features: ['Purple-tinged stems'],
            lookAlikes: ['Ocimum basilicum'],
          },
          {
            scientificName: 'Fakeus plantus',
            commonName: null,
            likelihood: 'UNLIKELY',
            features: ['Toothed leaves'],
            lookAlikes: [],
          },
        ],
        abstainReason: null,
      };
    } else if (system.includes('mark the fixed things in this photo')) {
      out = {
        items: [
          { label: 'pot', box_2d: [600, 100, 800, 200], note: 'Terracotta pot' },
          { label: 'railing', box_2d: [400, 0, 900, 1000], note: 'Metal railing' },
          { label: 'seating', box_2d: [500, 600, 900, 900], note: 'Bench' },
        ],
        imageUsable: true,
        abstainReason: null,
      };
    } else if (system.includes('extract plant traits from the research text')) {
      const urls = [...text.matchAll(/— (https:\/\/\S+)/g)].map((m) => m[1] ?? '');
      out = {
        traits: [
          {
            trait: 'minTempC',
            value: 0,
            unit: '°C',
            appliesTo: null,
            citations: [{ url: urls[0], title: 'extension.example.edu' }],
          },
          {
            trait: 'maxHeightM',
            value: 1.75,
            unit: 'm',
            appliesTo: null,
            citations: [{ url: urls[1] ?? urls[0], title: 'kew.org' }],
          },
          {
            trait: 'toxicity',
            value: 'Not documented for pets',
            unit: null,
            appliesTo: null,
            citations: [{ url: urls[0], title: 'extension.example.edu' }],
          },
        ],
        cannotDetermine: ['container size'],
      };
    } else {
      out = { plain: 'Frost is rare here and summers are hot.', terms: [], unknowns: [] };
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 120 },
      }),
    });
  });
  return state;
}

export async function seedPune(page: Page) {
  await page.goto('/welcome?step=space');
  await page.getByRole('button', { name: 'Balcony' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill('Pune');
  await page.getByRole('list', { name: 'Places found' }).getByRole('button', { name: /Pune/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Grow food' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('match').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your garden is planted' })).toBeVisible();
}

export async function saveKey(page: Page) {
  await page.goto('/settings/ai');
  await page.getByRole('textbox', { name: 'API key' }).fill(KEY);
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByText('Key saved. AI features are ready.').first()).toBeVisible();
  await expect(page.getByTestId('key-status')).toContainText(`…${KEY.slice(-4)}`);
}
