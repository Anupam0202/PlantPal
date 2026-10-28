import { readFile } from 'node:fs/promises';
import { FAKE_KEY, legacyFixture } from '../../../packages/domain/test/fixtures/legacy';
import { addPlant, createGarden, expect, test } from './helpers';

test('v3 data is previewed, backed up without the API key, migrated and verified (W11)', async ({ page }) => {
  await page.addInitScript((data) => {
    if (sessionStorage.getItem('seeded')) return;
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    sessionStorage.setItem('seeded', '1');
  }, legacyFixture);

  await page.goto('/today');
  await expect(page.getByText('We found your PlantPal data')).toBeVisible();
  await page.getByRole('link', { name: 'Review and bring it over' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bring over your PlantPal data' })).toBeVisible();
  const plantsRow = page.getByRole('row', { name: /^Plants/ });
  await expect(plantsRow.getByRole('cell')).toHaveText(['6', '4', '2']);

  await expect(page.getByText('An old Gemini API key is saved unprotected')).toBeVisible();
  await page.getByRole('button', { name: 'Remove the old key' }).click();
  await expect(page.getByText('An old Gemini API key is saved unprotected')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('plantpal-user-gemini-api-key'))).toBeNull();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Back up and bring it over' }).click(),
  ]);
  const backup = await readFile((await download.path()) ?? '', 'utf8');
  expect(backup).toContain('plantpal-garden-plants');
  expect(backup).not.toContain(FAKE_KEY);

  await expect(page.getByRole('heading', { name: 'Your data is here' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('row', { name: /^Plants/ }).getByRole('cell')).toHaveText(['5', '5']);
  await expect(page.getByText('1 of 1 photos recovered')).toBeVisible();

  await page.getByRole('button', { name: 'Open my garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Tomato/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Basil/ })).toBeVisible();
  await page.getByRole('link', { name: /Tomato/ }).click();
  await expect(page.getByText('Brought over from PlantPal v3')).toBeVisible();
  await expect(page.getByText('1.5 L')).toBeVisible();
  await expect(page.locator('main img').first()).toBeVisible();

  await page.goto('/settings/migrate?source=browser');
  await page.getByRole('button', { name: 'Remove old data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove old data' }).click();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('plantpal-'))),
  ).toEqual([]);
});

test('a full backup restores everything after the device data is deleted (W12)', async ({ page }) => {
  await createGarden(page, 'Terrace');
  await addPlant(page, '=SUM(A1)');
  await page.goto('/settings/data');

  const [backup] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).first().click(),
  ]);
  expect(backup.suggestedFilename()).toMatch(/^plantpal-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const backupPath = (await backup.path()) ?? '';

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).nth(1).click(),
  ]);
  expect(csv.suggestedFilename()).toMatch(/^plantpal-spreadsheets-/);

  await page.getByRole('button', { name: 'Delete all data' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete everything on this device' });
  await confirm.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.getByRole('button', { name: 'Delete all data' }).click();
  await expect(page.getByText('All PlantPal data on this device was deleted.')).toBeVisible();

  await page.getByTestId('import-input').setInputFiles(backupPath);
  const preview = page.getByRole('dialog', { name: 'Import preview' });
  await expect(preview.getByRole('row', { name: /^Plants/ }).getByRole('cell')).toHaveText([
    '1',
    '0',
    '0',
    '0',
  ]);
  await preview.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText(/Imported \d+ records/)).toBeVisible();

  await page.goto('/garden');
  await expect(page.getByRole('heading', { level: 1, name: 'Terrace' })).toBeVisible();
  await expect(page.getByRole('link', { name: /=SUM\(A1\)/ })).toBeVisible();
});
