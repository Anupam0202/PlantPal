import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseOklch, toCssHex } from '../src/color';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

/** Extract `--pp-*` tokens from the first block matching `selector {`. */
function themeTokens(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart);
  if (start < 0) throw new Error(`missing block ${selectorStart}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--pp-([\w-]+):\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

const light = themeTokens(':root {');
const dark = themeTokens("[data-theme='dark'] {");

// [foreground, background, minimum ratio]
const pairs: Array<[string, string, number]> = [
  ['ink', 'bg', 4.5],
  ['ink', 'surface', 4.5],
  ['ink', 'sunken', 4.5],
  ['ink', 'raised', 4.5],
  ['muted', 'bg', 4.5],
  ['muted', 'surface', 4.5],
  ['muted', 'sunken', 4.5],
  ['subtle', 'surface', 3], // large text, icons and non-essential captions only
  ['accent-ink', 'surface', 4.5],
  ['accent-ink', 'bg', 4.5],
  ['accent-ink', 'accent-soft', 4.5],
  ['on-accent', 'accent', 4.5],
  ['on-accent', 'accent-hover', 4.5],
  ['danger', 'surface', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['warning', 'surface', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['info', 'surface', 4.5],
  ['info', 'info-soft', 4.5],
  ['clay', 'clay-soft', 4.5],
  ['dusk', 'dusk-soft', 4.5],
  ['ink', 'pollen-soft', 4.5],
  ['focus', 'surface', 3], // focus indicators need 3:1 (WCAG 2.2 non-text contrast)
  ['line-strong', 'surface', 1.5], // decorative dividers
  ['control', 'surface', 3], // input and control boundaries (WCAG 1.4.11)
  ['control', 'sunken', 3],
  ['control', 'bg', 3],
];

describe.each([
  ['Paper (light)', light],
  ['Night Garden (dark)', dark],
])('%s theme contrast', (_name, tokens) => {
  it.each(pairs)('%s on %s ≥ %s:1', (fg, bg, min) => {
    const f = tokens[fg];
    const b = tokens[bg];
    expect(f, `token ${fg}`).toBeDefined();
    expect(b, `token ${bg}`).toBeDefined();
    const ratio = contrastRatio(f!, b!);
    expect(
      ratio,
      `${fg} ${toCssHex(parseOklch(f!))} on ${bg} ${toCssHex(parseOklch(b!))}`,
    ).toBeGreaterThanOrEqual(min);
  });
});
