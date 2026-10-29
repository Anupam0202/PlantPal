/**
 * `pnpm eval:live` — run by the repository owner by hand, with their own key and a small budget.
 * Never runs in CI. Sends each selected case input to the live Gemini API, prints the same metrics as
 * the replay, and records the raw responses (origin `live`) for review in evals/recorded/.
 *
 *   GEMINI_API_KEY=… pnpm eval:live -- --limit 20 --feature capture-parse
 *
 * The key is read from the environment only, sent only in the x-goog-api-key header, and never
 * written to disk or printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AiError,
  altTextV1,
  captureParseV1,
  GeminiClient,
  listModels,
  pickModels,
  plainExplainV1,
  planExplainV1,
  prohibitedClaims,
  redactKeys,
  stringsOf,
  type AiFeatureId,
  type PromptModule,
} from '../src';
import { loadCases } from './run';
import type { EvalCase, RecordedResponse } from './types';

const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- one table of differently typed modules
const MODULES: Record<AiFeatureId, PromptModule<any, any>> = {
  'plan-explain': planExplainV1,
  'capture-parse': captureParseV1,
  'alt-text': altTextV1,
  'plain-explain': plainExplainV1,
};

if (process.env.CI) {
  console.error('eval:live never runs in CI.');
  process.exit(1);
}
const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('Set GEMINI_API_KEY in your shell for this one command.');
  process.exit(1);
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const limit = Number(arg('limit') ?? 20);
const feature = arg('feature');

const roles = pickModels(await listModels(key));
console.log('Models:', roles);

const cases = loadCases()
  .filter((c) => !c.tags.includes('errors') && (!feature || c.feature === feature))
  .slice(0, limit);

const recorded: EvalCase[] = [];
let claims = 0;
let ok = 0;
for (const c of cases) {
  const responses: RecordedResponse[] = [];
  const client = new GeminiClient({
    getKey: async () => key,
    roles: () => roles,
    fetch: async (url, init) => {
      const res = await fetch(url, init);
      const body = await res
        .clone()
        .json()
        .catch(() => null);
      responses.push({ status: res.status, body });
      return res;
    },
  });
  try {
    const out = await client.generateStructured(MODULES[c.feature], c.input);
    ok++;
    claims += stringsOf(out.data).reduce((n, s) => n + prohibitedClaims(s).length, 0);
    recorded.push({ ...c, id: `live-${c.id}`, origin: 'live', responses, expect: { outcome: 'ok' } });
    console.log(
      `✓ ${c.id} (${out.meta.model}, ${out.meta.inputTokens}+${out.meta.outputTokens} tokens${out.meta.repaired ? ', repaired' : ''})`,
    );
  } catch (e) {
    const code = e instanceof AiError ? e.code : 'NETWORK';
    recorded.push({
      ...c,
      id: `live-${c.id}`,
      origin: 'live',
      responses,
      expect: { outcome: 'error', code },
    });
    console.log(`✗ ${c.id}: ${code} ${redactKeys((e as Error).message)}`);
  }
}

const dir = join(here, 'recorded');
mkdirSync(dir, { recursive: true });
const file = join(dir, `live-${new Date().toISOString().slice(0, 10)}.jsonl`);
writeFileSync(file, redactKeys(recorded.map((r) => JSON.stringify(r)).join('\n')) + '\n');
console.log(`\n${ok}/${cases.length} accepted · prohibited claims in accepted outputs: ${claims}`);
console.log(
  `Recorded to ${file}. Review before committing; move reviewed lines into evals/cases/ to replay them.`,
);
