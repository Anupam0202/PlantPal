#!/usr/bin/env node
// Bundle budgets (§22.1): initial JS ≤ 170 kB gzip; each lazy chunk ≤ 120 kB gzip
// (vendor-only chunks for maps/charts/AI SDK are listed explicitly with their own ceilings).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = process.argv[2] ?? 'apps/web/dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]));
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
const INITIAL_BUDGET = 170 * 1024;
const CHUNK_BUDGET = 120 * 1024;
const vendorCeilings = [
  // MapLibre GL 6 is ~286 kB gzip on its own; it loads only on map pages (ADR-0014).
  { re: /maplibre/i, max: 300 * 1024 },
  { re: /genai|gemini/i, max: 160 * 1024 },
];
let initialTotal = 0;
const failures = [];
for (const f of initial) initialTotal += gz(f);
for (const name of readdirSync(join(dist, 'assets')).filter((n) => n.endsWith('.js'))) {
  const f = `assets/${name}`;
  if (initial.has(f)) continue;
  const size = gz(f);
  const ceiling = vendorCeilings.find((v) => v.re.test(name))?.max ?? CHUNK_BUDGET;
  if (size > ceiling) failures.push(`${f} is ${kb(size)} gzip (budget ${kb(ceiling)})`);
}
console.log(
  `Initial JS: ${kb(initialTotal)} gzip across ${initial.size} files (budget ${kb(INITIAL_BUDGET)})`,
);
if (initialTotal > INITIAL_BUDGET)
  failures.push(`initial JS ${kb(initialTotal)} exceeds ${kb(INITIAL_BUDGET)}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
