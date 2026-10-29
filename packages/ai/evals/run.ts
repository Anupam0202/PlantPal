/**
 * `pnpm eval`: replays every case in evals/cases/*.jsonl through the real client, validators and
 * error mapping with a recorded-response fetch. Deterministic; no network; runs in CI.
 *
 * Gates (exit 1 when any fails): every case meets its expectation; 0 prohibited claims in accepted
 * outputs; every accepted ID is grounded; ≥ 120 cases; the required scenarios are covered.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CaptureProposals, PlanExplanation } from '@plantpal/schemas';
import {
  AiError,
  altTextV1,
  captureParseV1,
  GeminiClient,
  plainExplainV1,
  planExplainV1,
  prohibitedClaims,
  stringsOf,
  type AiFeatureId,
  type CaptureParseInput,
  type PlanExplainInput,
  type PromptModule,
} from '../src';
import type { EvalCase, RecordedResponse } from './types';

const here = dirname(fileURLToPath(import.meta.url));
/** Key-shaped strings are built at runtime so none is committed (secret scanners would flag them). */
const FAKE_KEY = 'AIza' + 'Sy' + 'REPLAY'.repeat(5) + '000';
const INPUT_KEY = 'AIza' + 'Sy' + 'PASTED'.repeat(5) + '000';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one table of differently typed modules
const MODULES: Record<AiFeatureId, PromptModule<any, any>> = {
  'plan-explain': planExplainV1,
  'capture-parse': captureParseV1,
  'alt-text': altTextV1,
  'plain-explain': plainExplainV1,
};

const REQUIRED_TAGS = [
  'injection',
  'zero-light',
  'covered-balcony',
  'pets',
  'children',
  'invasive',
  'toxic',
  'missing-facts',
  'malformed',
  'truncated',
  'refusal',
  'consent',
  'quota',
  'billing',
  'lang:hi',
  'lang:es',
  'units',
  'abstain',
  'prohibited',
];

export function loadCases(dir = join(here, 'cases')): EvalCase[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort()
    .flatMap((f) =>
      readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l.replaceAll('{{FAKE_KEY}}', INPUT_KEY)) as EvalCase),
    );
}

function replay(responses: RecordedResponse[]) {
  const queue = [...responses];
  let calls = 0;
  const leaks: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls++;
    if (String(url).includes(FAKE_KEY) || String(init.body ?? '').includes(FAKE_KEY)) leaks.push(String(url));
    const next = queue.shift();
    if (!next) throw new Error('Replay exhausted: the client made more requests than were recorded.');
    if ('networkError' in next) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers });
  }) as unknown as typeof fetch;
  return { fetch: f, calls: () => calls, leaks };
}

/** The fields the checks read, across all feature outputs. */
interface Loose {
  perPlant?: Array<{ taxonKey: string }>;
  proposals?: Array<{
    type: string;
    specimenId: string | null;
    kind?: string;
    amount?: { value: number; unit: string } | null;
  }>;
  unknowns?: string[];
  plantVisible?: boolean;
}

export interface CaseResult {
  id: string;
  feature: AiFeatureId;
  pass: boolean;
  reason: string | null;
  outcome: string;
  repaired: boolean;
  firstTryValid: boolean;
  claims: number;
  ungroundedIds: number;
  tokens: number;
  abstainChecked: boolean;
}

export async function runCase(c: EvalCase): Promise<CaseResult> {
  const m = MODULES[c.feature];
  const r = replay(c.responses);
  const client = new GeminiClient({
    getKey: async () => FAKE_KEY,
    roles: () => ({ balanced: 'gemini-3.5-flash', fast: 'gemini-3.5-flash-lite' }),
    fetch: r.fetch,
    sleep: async () => undefined,
    now: () => 0,
  });
  const res: CaseResult = {
    id: c.id,
    feature: c.feature,
    pass: false,
    reason: null,
    outcome: '',
    repaired: false,
    firstTryValid: false,
    claims: 0,
    ungroundedIds: 0,
    tokens: 0,
    abstainChecked: false,
  };
  const fail = (reason: string) => ({ ...res, pass: false, reason });
  try {
    const out = await client.generateStructured(m, c.input, {
      allowed: c.allowed ? new Set(c.allowed) : null,
    });
    res.outcome = 'ok';
    res.repaired = out.meta.repaired;
    res.firstTryValid = !out.meta.repaired;
    res.tokens = out.meta.inputTokens + out.meta.outputTokens;
    res.claims = stringsOf(out.data).reduce((n, s) => n + prohibitedClaims(s).length, 0);
    if (c.feature === 'capture-parse') {
      const ids = new Set((c.input as CaptureParseInput).specimens.map((s) => s.id));
      res.ungroundedIds = (out.data as CaptureProposals).proposals.filter(
        (p) => p.specimenId !== null && !ids.has(p.specimenId),
      ).length;
    }
    if (c.feature === 'plan-explain') {
      const keys = new Set((c.input as PlanExplainInput).candidates.map((x) => x.taxonKey));
      res.ungroundedIds = (out.data as PlanExplanation).perPlant.filter((p) => !keys.has(p.taxonKey)).length;
    }
    if (r.leaks.length) return fail('API key appeared in a URL or body');
    if (c.expect.outcome !== 'ok') return fail(`expected ${c.expect.code}, got ok`);
    const k = c.expect.checks ?? {};
    const data = out.data as Loose;
    const proposals = data.proposals ?? [];
    if (k.repaired !== undefined && k.repaired !== out.meta.repaired)
      return fail(`repaired=${out.meta.repaired}`);
    if (
      k.perPlantKeys &&
      JSON.stringify((data.perPlant ?? []).map((p) => p.taxonKey)) !== JSON.stringify(k.perPlantKeys)
    )
      return fail('perPlant keys differ');
    if (k.specimenIds && JSON.stringify(proposals.map((p) => p.specimenId)) !== JSON.stringify(k.specimenIds))
      return fail('specimen ids differ');
    if (k.noTasks && proposals.some((p) => p.type === 'task')) return fail('a task was proposed');
    if (k.waterMl !== undefined) {
      const ml = proposals
        .filter((p) => p.type === 'careEvent' && p.kind === 'water')
        .reduce(
          (n, p) => n + (p.amount ? (p.amount.unit === 'l' ? p.amount.value * 1000 : p.amount.value) : 0),
          0,
        );
      if (Math.abs(ml - k.waterMl) > 1e-6) return fail(`water ${ml} ml ≠ ${k.waterMl}`);
    }
    if (k.abstains) {
      res.abstainChecked = true;
      const abstained =
        c.feature === 'alt-text'
          ? data.plantVisible === false
          : Array.isArray(data.unknowns) && data.unknowns.length > 0;
      if (!abstained) return fail('expected an abstention');
    }
    return { ...res, pass: true };
  } catch (e) {
    if (!(e instanceof AiError)) return fail(`unexpected ${(e as Error).message}`);
    res.outcome = e.code;
    if (r.leaks.length) return fail('API key appeared in a URL or body');
    if (c.expect.outcome === 'ok') return fail(`expected ok, got ${e.code}`);
    if (c.expect.code !== e.code) return fail(`expected ${c.expect.code}, got ${e.code}`);
    return { ...res, pass: true };
  }
}

export async function runAll(cases: EvalCase[]) {
  const results: CaseResult[] = [];
  for (const c of cases) results.push(await runCase(c));
  const accepted = results.filter((r) => r.outcome === 'ok');
  const tags = new Set(cases.flatMap((c) => c.tags));
  const climates = [...tags].filter((t) => t.startsWith('climate:'));
  const missing = REQUIRED_TAGS.filter((t) => !tags.has(t));
  const byFeature = new Map<string, { n: number; tokens: number }>();
  for (const r of accepted) {
    const f = byFeature.get(r.feature) ?? { n: 0, tokens: 0 };
    f.n++;
    f.tokens += r.tokens;
    byFeature.set(r.feature, f);
  }
  const metrics = {
    cases: cases.length,
    passed: results.filter((r) => r.pass).length,
    accepted: accepted.length,
    firstTryValidRate: accepted.length ? accepted.filter((r) => r.firstTryValid).length / accepted.length : 1,
    repairRate: accepted.length ? accepted.filter((r) => r.repaired).length / accepted.length : 0,
    prohibitedClaims: accepted.reduce((n, r) => n + r.claims, 0),
    ungroundedIds: accepted.reduce((n, r) => n + r.ungroundedIds, 0),
    abstentionChecks: results.filter((r) => r.abstainChecked).length,
    climates: climates.length,
    missingTags: missing,
    tokensPerFeature: Object.fromEntries([...byFeature].map(([k, v]) => [k, Math.round(v.tokens / v.n)])),
  };
  const gates = [
    [metrics.passed === metrics.cases, `all cases pass (${metrics.passed}/${metrics.cases})`],
    [metrics.prohibitedClaims === 0, `0 prohibited claims in accepted outputs (${metrics.prohibitedClaims})`],
    [metrics.ungroundedIds === 0, `0 ungrounded IDs (${metrics.ungroundedIds})`],
    [metrics.cases >= 120, `≥ 120 cases (${metrics.cases})`],
    [metrics.climates >= 6, `≥ 6 climates (${metrics.climates})`],
    [
      missing.length === 0,
      `required scenarios covered${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`,
    ],
  ] as const;
  return { results, metrics, gates };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { results, metrics, gates } = await runAll(loadCases());
  for (const r of results.filter((x) => !x.pass)) console.log(`✗ ${r.id}: ${r.reason}`);
  console.log(JSON.stringify(metrics, null, 2));
  let ok = true;
  for (const [pass, label] of gates) {
    console.log(`${pass ? '✓' : '✗'} ${label}`);
    ok &&= pass;
  }
  process.exit(ok ? 0 : 1);
}
