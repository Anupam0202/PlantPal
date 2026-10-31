import { describe, expect, it } from 'vitest';
import { buildCases } from '../evals/build-cases';
import { loadCases, runAll, runCase } from '../evals/run';

describe('eval harness', () => {
  it('committed cases match the builder (run `pnpm eval:build` after changing it)', () => {
    const built = Object.values(buildCases()).flat();
    const loaded = loadCases();
    expect(loaded.map((c) => c.id).sort()).toEqual(built.map((c) => c.id).sort());
    expect(new Set(loaded.map((c) => c.id)).size).toBe(loaded.length);
  });

  it('passes every gate', async () => {
    const { gates, metrics } = await runAll(loadCases());
    expect(gates.filter(([pass]) => !pass).map(([, label]) => label)).toEqual([]);
    expect(metrics.prohibitedClaims).toBe(0);
  });

  it('catches a wrong expectation and a prohibited claim that slips past', async () => {
    const [first] = loadCases().filter((c) => c.id === 'f1-london-good');
    const wrong = await runCase({ ...first!, expect: { outcome: 'error', code: 'SCHEMA_INVALID' } });
    expect(wrong.pass).toBe(false);
    const bad = await runCase({
      ...first!,
      responses: [first!.responses[0]!, first!.responses[0]!],
      expect: { outcome: 'ok', checks: { repaired: true } },
    });
    expect(bad.pass).toBe(false);
  });
});
