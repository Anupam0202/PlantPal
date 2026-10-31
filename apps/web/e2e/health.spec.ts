import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { GEMINI, mockGemini, saveKey, seedPune } from './gemini';
import { expect, jpegWithGps, test } from './helpers';
import { mockProviders } from './providers';

/** Opens a new health case for the first plant from its plant page. */
async function startCase(page: Page) {
  await page.goto('/garden');
  await page.locator('a[href^="/garden/plants/"]:not([href^="/garden/plants/new"])').first().click();
  await expect(page).toHaveURL(/\/garden\/plants\/[0-9A-Z]{26}$/);
  await page.getByRole('link', { name: 'New health case' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New health case' })).toBeVisible();
}

async function answer(page: Page) {
  await page.getByRole('button', { name: 'Wilting' }).click();
  await page.getByRole('button', { name: 'Crisp brown edges' }).click();
  await page.getByRole('radio', { name: 'Dry' }).check();
}

test('W5: a health case with photos, rule triage, AI second look, follow-up and outcome', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  const gemini = await mockGemini(page);
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(GEMINI) && r.method() === 'POST') sent.push(r.postData() ?? '');
  });
  await seedPune(page);
  await saveKey(page);
  await startCase(page);

  const photo = await jpegWithGps(page);
  await page
    .getByTestId('photo-slot-whole')
    .setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: photo });
  await expect(page.getByRole('button', { name: 'Remove photo: Whole plant' })).toBeVisible();
  await answer(page);

  const rules = page.getByTestId('triage-rules');
  await expect(rules).toContainText('Too little water');
  await expect(rules).toContainText('Likely');
  await expect(rules).toContainText('Safe first steps');

  await page.getByRole('button', { name: 'Ask AI for a second look' }).click();
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await expect(preview.getByRole('checkbox', { name: 'Photo' })).toBeChecked();
  await preview.getByRole('button', { name: 'Send' }).click();
  const ai = page.getByTestId('triage-ai');
  await expect(ai).toContainText('Underwatering in summer heat');
  await expect(ai).toContainText('AI draft');
  expect(gemini.lastImages).toBe(1);
  // The photo sent to Gemini was re-encoded on the device: no EXIF or GPS travels with it.
  const inline = JSON.parse(sent.at(-1) ?? '{}').contents[0].parts.find(
    (p: { inlineData?: unknown }) => p.inlineData,
  );
  expect(Buffer.from(inline.inlineData.data, 'base64').toString('latin1')).not.toContain(
    'PLANTPAL-SECRET-GPS',
  );

  await page.getByRole('button', { name: 'Save case' }).click();
  await expect(page).toHaveURL(/\/garden\/health\/[0-9A-Z]{26}$/);
  const timeline = page.getByTestId('case-timeline');
  await expect(timeline).toContainText('Photos');
  await expect(timeline).toContainText('Answers');
  await expect(timeline.getByText('Rules')).toBeVisible();
  await expect(timeline.getByText('AI draft')).toBeVisible();
  await expectNoA11yViolations(page, 'health case');

  await page.getByRole('radio', { name: 'Better' }).check();
  await page.getByRole('textbox', { name: 'Anything else?' }).fill('Perked up after watering');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Follow-up saved')).toBeVisible();
  await expect(timeline).toContainText('Perked up after watering');
  await expect(page.getByText('Watching').first()).toBeVisible();

  await page.getByRole('radio', { name: 'Resolved' }).check();
  await page.getByRole('button', { name: 'Close the case' }).click();
  await expect(page.getByRole('heading', { name: 'Case closed' })).toBeVisible();

  // The follow-up checks were scheduled; closing the case removed the ones still pending.
  await page.goto('/garden/health');
  await expect(page.getByTestId('health-cases')).toContainText('Closed');
});

test('consent denied: switching off photos sends nothing; rules triage still helps', async ({ page }) => {
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  await startCase(page);
  await page
    .getByTestId('photo-slot-leafTop')
    .setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
  await answer(page);
  await page.getByRole('button', { name: 'Ask AI for a second look' }).click();
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await preview.getByRole('checkbox', { name: 'Photo' }).click();
  await expect(preview).toContainText('This feature needs: Photo');
  await expect(preview.getByRole('button', { name: 'Send' })).toBeDisabled();
  await preview.getByRole('button', { name: 'Cancel' }).click();
  expect(gemini.generateCalls).toBe(0);
  await expect(page.getByTestId('triage-rules')).toContainText('Too little water');
});

test('partial JSON is never stored, and the AI can abstain (L05)', async ({ page }) => {
  test.setTimeout(90_000);
  await mockProviders(page);
  const gemini = await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  await startCase(page);
  await page
    .getByTestId('photo-slot-whole')
    .setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
  await answer(page);

  gemini.mode = 'truncated';
  await page.getByRole('button', { name: 'Ask AI for a second look' }).click();
  await page.getByRole('region', { name: 'Send to Gemini?' }).getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('The answer was cut off')).toBeVisible();
  await expect(page.getByTestId('triage-ai')).toHaveCount(0);

  gemini.mode = 'not-a-plant';
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('region', { name: 'Send to Gemini?' }).getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('triage-ai')).toContainText('The photos show a floor, not a plant.');

  await page.getByRole('button', { name: 'Save case' }).click();
  await expect(page).toHaveURL(/\/garden\/health\/[0-9A-Z]{26}$/);
  await page.reload();
  // Only validated triage was stored; the page renders after a reload.
  await expect(page.getByTestId('case-timeline')).toContainText('Answers');
  await expect(page.getByTestId('triage-ai')).toContainText('Nothing to compare yet');
});
