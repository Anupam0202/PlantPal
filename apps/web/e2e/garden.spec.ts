import { expectNoA11yViolations } from './axe';
import { addPlant, createGarden, expect, jpegWithGps, storedPhotos, test } from './helpers';

test('create a garden, a space and a plant, then log care that survives a reload', async ({ page }) => {
  await createGarden(page, 'Balcony');

  await page
    .getByRole('navigation', { name: 'Garden sections' })
    .getByRole('link', { name: 'Spaces' })
    .click();
  await page.getByRole('button', { name: 'Add space' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add space' });
  await dialog.getByLabel('Name').fill('South railing');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'South railing' })).toBeVisible();

  await addPlant(page, 'Cherry tomato');
  await page.getByRole('main').getByRole('button', { name: 'Log care' }).click();
  const sheet = page.getByRole('dialog', { name: 'Quick capture' });
  await expect(sheet.getByRole('button', { name: 'Cherry tomato', pressed: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Watered' }).click();
  await sheet.getByRole('button', { name: '1 L' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  const history = page.getByRole('region', { name: 'History' });
  await expect(history.getByText('Watered')).toBeVisible();
  await expect(history.getByText('1 L')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('region', { name: 'History' }).getByText('1 L')).toBeVisible();
  await page.goto('/garden/journal');
  await expect(page.getByText('Cherry tomato').first()).toBeVisible();
});

test('photos are re-encoded on the device and lose EXIF and GPS data', async ({ page }) => {
  await createGarden(page);
  await page.goto('/garden');
  const original = await jpegWithGps(page);
  expect(original.includes(Buffer.from('Exif'))).toBe(true);
  expect(original.includes(Buffer.from('PLANTPAL-SECRET-GPS'))).toBe(true);

  await addPlant(page, 'Basil', { photo: original });
  const photos = await storedPhotos(page);
  expect(photos).toHaveLength(1);
  const stored = Buffer.from(photos[0]?.bytes ?? []);
  expect(photos[0]?.type).toBe('image/webp');
  expect(stored.includes(Buffer.from('Exif'))).toBe(false);
  expect(stored.includes(Buffer.from('PLANTPAL-SECRET-GPS'))).toBe(false);
  expect(stored.length).toBeLessThan(original.length);
  await expect(page.locator('main img').first()).toBeVisible();
});

test('typed quick capture becomes proposals that are saved only after confirmation', async ({ page }) => {
  await createGarden(page);
  await addPlant(page, 'Tomato');
  await addPlant(page, 'Basil');
  await page.getByRole('button', { name: 'Log care' }).last().click();
  const sheet = page.getByRole('dialog', { name: 'Quick capture' });
  await sheet
    .getByRole('textbox', { name: 'Or type it' })
    .fill('watered tomatoes 2 l; harvested 300 g basil');
  await sheet.getByRole('button', { name: 'Read it' }).click();
  await expect(sheet.getByText('Check before saving')).toBeVisible();
  await expect(sheet.getByText('2 L', { exact: true })).toBeVisible();
  await expect(sheet.getByText('300 g', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('2 entries saved')).toBeVisible();
  await page.goto('/garden/journal');
  await expect(page.getByText('Harvested: Basil')).toBeVisible();
  await expect(page.getByText('2 L', { exact: true })).toBeVisible();
});

test('garden pages and the capture sheet have no automated accessibility violations', async ({ page }) => {
  await createGarden(page);
  await addPlant(page, 'Mint');
  const plantUrl = page.url();
  for (const path of [
    '/garden',
    '/garden/spaces',
    '/garden/journal',
    '/garden/new',
    '/garden/plants/new',
    '/garden/edit',
    '/settings/data',
    '/settings/migrate',
    plantUrl,
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page, path);
  }
  await page.goto('/today');
  await page.getByRole('button', { name: 'Log care' }).first().click();
  await page.getByRole('dialog', { name: 'Quick capture' }).getByRole('button', { name: 'Watered' }).click();
  await expectNoA11yViolations(page, 'quick capture');
});

test.describe('under the production CSP', () => {
  test.use({ bypassCSP: false });

  test('creating, photographing, logging and exporting cause no CSP or Trusted Types violations', async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (/Content Security Policy|TrustedHTML|TrustedScript|Trusted Type|CSP violation/i.test(msg.text()))
        violations.push(msg.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) =>
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
      );
    });
    await createGarden(page);
    await page.goto('/garden');
    await addPlant(page, 'Lavender', { photo: await jpegWithGps(page) });
    await expect(page.locator('main img').first()).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Log care' }).click();
    const sheet = page.getByRole('dialog', { name: 'Quick capture' });
    await sheet.getByRole('button', { name: 'Pruned' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('region', { name: 'History' }).getByText('Pruned')).toBeVisible();
    await page.goto('/settings/data');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).first().click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    expect(violations).toEqual([]);
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('the app reopens without a connection and keeps logging care on the device', async ({
    page,
    context,
  }) => {
    await createGarden(page, 'Windowsill');
    await addPlant(page, 'Aloe');
    await page.goto('/today');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.goto('/garden');
    await expect(page.getByRole('heading', { level: 1, name: 'Windowsill' })).toBeVisible();
    await page.getByRole('link', { name: /Aloe/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Aloe' })).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Log care' }).click();
    const sheet = page.getByRole('dialog', { name: 'Quick capture' });
    await expect(sheet.getByRole('button', { name: 'Aloe', pressed: true })).toBeVisible();
    await sheet.getByRole('button', { name: 'Watered' }).click();
    await sheet.getByRole('button', { name: '250 ml' }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('region', { name: 'History' }).getByText('250 ml')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('region', { name: 'History' }).getByText('250 ml')).toBeVisible();
    await context.setOffline(false);
  });
});
