#!/usr/bin/env node
// Release gate 5 (§25.1): no fabricated data in what people see. Scans app and server source (not
// tests, fixtures or docs) for placeholder people, lorem ipsum, fake ratings, fake activity counts
// and demo names. Fixtures used in demo mode are labelled as demo data and live under `fixtures/`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = [
  'apps/web/src',
  'apps/api/src',
  'packages/domain/src',
  'packages/ai/src',
  'packages/catalog/src',
];
const SKIP = [/\/fixtures\//, /\.test\.tsx?$/, /routeTree\.gen\.ts$/];

const PATTERNS = [
  { re: /\blorem ipsum\b/i, why: 'placeholder text' },
  { re: /\b(?:john|jane) (?:doe|smith)\b/i, why: 'placeholder person' },
  { re: /\b(?:acme|foo ?bar|test user|sample user|demo user)\b/i, why: 'placeholder name' },
  { re: /[★⭐]{3,}/u, why: 'star rating' },
  {
    re: /\b\d[\d,.]*\s*(?:k\+?|thousand|million)?\s+(?:happy\s+)?(?:users|gardeners|members|downloads)\b(?! (?:can|who|may|will|need))/i,
    why: 'activity count claim',
  },
  { re: /\b(?:trusted by|loved by|join (?:over|thousands))\b/i, why: 'social proof claim' },
  { re: /\btestimonial\b/i, why: 'testimonial' },
  { re: /\b(?:fake|dummy|placeholder) (?:data|post|event|listing|review|user)s?\b/i, why: 'fake content' },
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(?:ts|tsx|mjs|js)$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS)
  for (const f of files(root)) {
    const path = relative('.', f);
    if (SKIP.some((s) => s.test(path))) continue;
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        // Comments that explain the rule itself are allowed.
        if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
        for (const p of PATTERNS)
          if (p.re.test(line)) hits.push(`${path}:${i + 1}: ${p.why}: ${line.trim().slice(0, 120)}`);
      });
  }

if (hits.length) {
  console.error(`Fabricated or placeholder content found (${hits.length}):\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(
  `check-fabricated: no placeholder people, fake ratings or invented activity in ${ROOTS.join(', ')}`,
);
