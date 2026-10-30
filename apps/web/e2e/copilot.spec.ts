import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { GEMINI, KEY, mockGemini, saveKey, seedPune } from './gemini';
import { addPlant, expect, test } from './helpers';
import { mockProviders } from './providers';

test('Garden Copilot: reads the garden with tools, suggests a change, and saves it only on confirm', async ({
  page,
  isMobile,
}) => {
  await mockProviders(page);
  const gemini = await mockGemini(page);
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(GEMINI)) sent.push(r.url());
  });
  await seedPune(page);
  await addPlant(page, 'Basil');
  await saveKey(page);

  if (isMobile) await page.goto('/copilot');
  else {
    await page.goto('/today');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.getByRole('option', { name: 'Open Garden Copilot' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Garden Copilot' })).toBeVisible();

  // First, the person chooses what its tools may read.
  await expect(page.getByRole('heading', { name: 'What the Copilot may read' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Care history and journal notes' })).not.toBeChecked();
  await expectNoA11yViolations(page, 'copilot access');
  await page.getByRole('button', { name: 'Save and start' }).click();

  await page.getByRole('textbox', { name: 'Ask the Copilot' }).fill('I just watered with half a litre');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const answer = page.getByTestId('copilot-message').last();
  await expect(answer.getByText(/I suggested logging 500 ml of water/)).toBeVisible();
  await expect(answer.getByText('Looked at: your garden')).toBeVisible();
  const card = answer.getByTestId('proposal');
  await expect(card.getByText('Log care')).toBeVisible();
  await expect(card.getByText(/water 500 ml ·/)).toBeVisible();
  await expectNoA11yViolations(page, 'copilot answer');

  // Nothing was written until now.
  const careCount = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const open = indexedDB.open('plantpal');
          open.onsuccess = () => {
            const req = open.result.transaction('careEvents').objectStore('careEvents').count();
            req.onsuccess = () => {
              resolve(req.result);
              open.result.close();
            };
          };
        }),
    );
  const before = await careCount();
  await card.getByRole('button', { name: 'Confirm' }).click();
  await expect(card.getByRole('status')).toHaveText('Saved');
  expect(await careCount()).toBe(before + 1);

  // The tool loop continued with the model's thought signature; the key stayed in the header.
  expect(gemini.signatureEchoed).toBe(true);
  expect(gemini.streamUrls.length).toBe(3);
  for (const u of sent) expect(u).not.toContain(KEY);
});

test('weekly reflection: a kind look back on the first visit in a new week, dismissible', async ({
  page,
}) => {
  await mockProviders(page);
  await page.clock.install({ time: new Date('2026-10-14T09:00:00') });
  await addPlantInNewGarden(page);
  // Twelve days later, in a new week.
  await page.clock.setSystemTime(new Date('2026-10-26T09:00:00'));
  await page.goto('/today');
  const card = page.getByTestId('weekly-reflection');
  await expect(card.getByRole('heading', { name: 'Last week in your garden' })).toBeVisible();
  await expect(
    card.getByText('A quiet week: nothing logged, and that’s fine. Plants keep growing.'),
  ).toBeVisible();
  await expectNoA11yViolations(page, 'today with reflection');
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('weekly-reflection')).toHaveCount(0);
});

async function addPlantInNewGarden(page: Page) {
  await page.goto('/garden/new');
  await page.getByLabel('Garden name').fill('Balcony');
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
}
