#!/usr/bin/env node
// Renders PNG app icons from the SVG logo using the preinstalled Chromium (Playwright).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('@playwright/test'));
}
const svg = readFileSync('apps/web/public/icons/favicon.svg', 'utf8');
const maskable = readFileSync('apps/web/public/icons/maskable.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, src, size] of [
  ['apple-touch-icon.png', svg, 180],
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['maskable-512.png', maskable, 512],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  const buf = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
  writeFileSync(`apps/web/public/icons/${name}`, buf);
  console.log(`wrote ${name} (${buf.length} bytes)`);
}
await browser.close();
