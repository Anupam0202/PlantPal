#!/usr/bin/env node
// Fails if a build directory contains anything shaped like a Google API key (L01) or other common secrets.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'apps/web/dist';
const patterns = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: 'Generic secret assignment',
    re: /(?:api[_-]?key|secret|token)["']?\s*[:=]\s*["'][A-Za-z0-9_-]{32,}["']/i,
  },
];
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.size < 20 * 1024 * 1024 && /\.(js|mjs|css|html|json|map|webmanifest|txt)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      for (const { name: kind, re } of patterns) if (re.test(text)) hits.push(`${kind} in ${p}`);
    }
  }
}
try {
  walk(root);
} catch (e) {
  console.error(`scan-dist: cannot read ${root}: ${e.message}`);
  process.exit(2);
}
if (hits.length) {
  console.error('Secret-like content found in build output:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`scan-dist: no secrets found in ${root}`);
