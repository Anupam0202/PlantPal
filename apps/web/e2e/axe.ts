import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string[] }>;
}

/** Runs axe-core WCAG 2.2 A/AA rules on the current page and fails on any violation. */
export async function expectNoA11yViolations(page: Page, context = 'page') {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe is injected at runtime
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    });
    return result.violations as AxeViolation[];
  });
  const summary = violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `${context} accessibility violations`).toEqual([]);
}
