import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { expect, test } from './helpers';
import { GEMINI, KEY, mockGemini, saveKey, seedPune } from './gemini';
import { mockProviders } from './providers';

/** Everything this origin keeps: web storage, cookies, every IndexedDB database and Cache Storage. */
async function dumpStorage(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const latin1 = new TextDecoder('windows-1252');
    const replacer = (_k: string, v: unknown) => {
      if (v instanceof ArrayBuffer) return latin1.decode(v);
      if (ArrayBuffer.isView(v)) return latin1.decode(v as Uint8Array);
      if (v instanceof Blob) return '[blob]';
      if (typeof CryptoKey !== 'undefined' && v instanceof CryptoKey) return '[cryptokey]';
      return v;
    };
    const out: string[] = [JSON.stringify(localStorage), JSON.stringify(sessionStorage), document.cookie];
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((res, rej) => {
          const r = db.transaction(store, 'readonly').objectStore(store).getAll();
          r.onsuccess = () => res(r.result as unknown[]);
          r.onerror = () => rej(r.error);
        });
        out.push(`${name}/${store}:${JSON.stringify(rows, replacer)}`);
      }
      db.close();
    }
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const req of await cache.keys()) out.push(req.url, (await (await cache.match(req))?.text()) ?? '');
    }
    return out.join('\n');
  });
}

test('ai/key-never-leaves-device: the key goes only to Gemini, only in its header', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const pending: Array<
    Promise<{ url: string; method: string; headers: Record<string, string>; body: string }>
  > = [];
  context.on('request', (r) => {
    pending.push(
      r
        .allHeaders()
        .then((headers) => ({ url: r.url(), method: r.method(), headers, body: r.postData() ?? '' })),
    );
  });
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await saveKey(page);

  // Device mode survives a reload: it is stored, but only encrypted.
  await page.reload();
  await expect(page.getByTestId('key-status')).toContainText('saved encrypted on this device');

  await page.goto('/plan');
  await page.getByRole('button', { name: 'Explain these matches' }).click();
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await expect(preview).toBeVisible();
  // The coarse area is shown and can be switched off; the plant list is required.
  await preview.getByText('Show exactly what is sent').click();
  await expect(preview).toContainText('### Area');
  await preview.getByRole('checkbox', { name: 'Area (city or region only)' }).click();
  await expect(preview).not.toContainText('### Area');
  await preview.getByRole('button', { name: 'Send' }).click();
  const card = page.getByTestId('plan-explanation');
  await expect(card).toContainText('These plants suit this balcony');
  await expect(card).toContainText('Suggested by AI');
  // Lantana is invasive in India: PlantPal's rules drop the AI's extra suggestion.
  await expect(card).toContainText('1 AI suggestion was left out');
  expect(gemini.generateCalls).toBe(1);

  await page.goto('/settings/ai');
  await expect(page.getByTestId('ai-usage')).toContainText('Today: 1 requests');

  // A full backup never contains the key.
  await page.goto('/settings/data');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).first().click(),
  ]);
  const zip = unzipSync(new Uint8Array(await readFile((await download.path()) ?? '')));
  const exported = Object.values(zip)
    .map((u) => strFromU8(u, true))
    .join('\n');
  expect(exported.length).toBeGreaterThan(100);
  expect(exported).not.toContain(KEY);

  // Nothing this origin stores holds the key in plain text.
  const stored = await dumpStorage(page);
  expect(stored).toContain('plantpal-vault/kv');
  expect(stored).not.toContain(KEY);

  // Every request: the key appears only in the x-goog-api-key header of Gemini requests.
  const seen = await Promise.all(pending);
  const geminiRequests = seen.filter((r) => r.url.startsWith(GEMINI) && r.method !== 'OPTIONS');
  // One model listing (key check) and one generation.
  expect(geminiRequests.map((r) => (r.url.includes(':generateContent') ? 'generate' : 'models'))).toEqual([
    'models',
    'generate',
  ]);
  for (const r of seen) {
    expect(r.url).not.toContain(KEY);
    expect(r.body).not.toContain(KEY);
    const withKey = Object.entries(r.headers)
      .filter(([, v]) => v.includes(KEY))
      .map(([k]) => k);
    expect(withKey).toEqual(r.url.startsWith(GEMINI) && r.method !== 'OPTIONS' ? ['x-goog-api-key'] : []);
  }
});

test('no key: the action explains, links to Settings › AI and resumes after the key is added', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Explain these matches' }).click();
  await expect(page.getByText('Add your Gemini key to use this')).toBeVisible();
  await expect(page.getByText('Without AI:')).toBeVisible();
  expect(gemini.generateCalls).toBe(0);
  await page.getByRole('link', { name: 'Open Settings › AI' }).click();

  await page.getByRole('textbox', { name: 'API key' }).fill('not-a-key');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByText('That does not look like a Gemini API key')).toBeVisible();
  await page.getByRole('textbox', { name: 'API key' }).fill(KEY);
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByRole('button', { name: 'Go back and continue' }).click();
  // The pending action resumes: the preview opens by itself on the Plan page.
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await expect(preview).toBeVisible();
  await expectNoA11yViolations(page, 'send preview');
  await preview.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('plan-explanation')).toBeVisible();
});

test('rate limits show a countdown and are not retried in a loop (Appendix B)', async ({ page }) => {
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  gemini.mode = 'rate-limited';
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Explain these matches' }).click();
  await page.getByRole('region', { name: 'Send to Gemini?' }).getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Too many requests right now')).toBeVisible();
  await expect(page.getByRole('button', { name: /Try again in \d+ s/ })).toBeDisabled();
  expect(gemini.generateCalls).toBe(1);
});

test('Quick Capture: AI proposals are checked before saving; a pasted key is never sent', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  await page.goto('/today');
  await page.getByRole('button', { name: 'Log care' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Quick capture' });
  await sheet.getByRole('textbox', { name: 'Or type it' }).fill(`my key is ${KEY}`);
  await sheet.getByRole('button', { name: 'Read with AI' }).click();
  const preview = sheet.getByRole('region', { name: 'Send to Gemini?' });
  await expect(preview).toContainText('looks like an API key');
  await expect(preview.getByRole('button', { name: 'Send' })).toBeDisabled();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  expect(gemini.generateCalls).toBe(0);

  await sheet.getByRole('textbox', { name: 'Or type it' }).fill('gave the first plant a litre');
  await sheet.getByRole('button', { name: 'Read with AI' }).click();
  await sheet.getByRole('region', { name: 'Send to Gemini?' }).getByRole('button', { name: 'Send' }).click();
  await expect(sheet.getByRole('heading', { name: 'Check before saving' })).toBeVisible();
  await expect(sheet.getByText('Suggested by AI')).toBeVisible();
  await expect(sheet.getByText('1 L').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
});

test('the AI switch hides every entry point; an earlier key moves into the vault', async ({ page }) => {
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('plantpal-user-gemini-api-key', key);
    sessionStorage.setItem('seeded', '1');
  }, KEY);
  await mockProviders(page);
  await mockGemini(page);
  await seedPune(page);
  await page.goto('/settings/ai');
  await expect(page.getByText('A key from earlier PlantPal data is stored unencrypted')).toBeVisible();
  await page.getByRole('button', { name: 'Move into the vault' }).click();
  await expect(page.getByText('Key moved into the vault.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('plantpal-user-gemini-api-key'))).toBeNull();
  await expect(page.getByTestId('key-status')).toContainText(`…${KEY.slice(-4)}`);
  await expectNoA11yViolations(page, 'settings ai');

  await page.getByRole('switch', { name: 'AI features' }).click();
  await page.goto('/plan');
  await expect(page.getByTestId('match').first()).toBeVisible();
  await expect(page.locator('[data-ai-entry]')).toHaveCount(0);
});
