import { expectNoA11yViolations } from './axe';
import type { Page } from '@playwright/test';
import { expect, test } from './helpers';
import { mockProviders } from './providers';

/** Seed a Pune balcony plan quickly and return to the app. */
async function seedPune(page: Page) {
  await page.goto('/welcome?step=space');
  await page.getByRole('button', { name: 'Balcony' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill('Pune');
  await page.getByRole('list', { name: 'Places found' }).getByRole('button', { name: /Pune/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Grow food' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('match').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your garden is planted' })).toBeVisible();
}

async function plantFirst(page: Page): Promise<string> {
  await page.goto('/garden');
  await page.locator('a[href^="/garden/plants/"]:not([href^="/garden/plants/new"])').first().click();
  await expect(page).toHaveURL(/\/garden\/plants\/[0-9A-Z]{26}$/);
  await expect(page.getByTestId('care-panel')).toBeVisible();
  const name = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  const panel = page.getByTestId('care-panel');
  await panel.getByRole('button', { name: 'Mark as planted' }).click();
  await expect(page.getByText('Planted. Care tasks are set up.')).toBeVisible();
  await expect(panel.getByText('Look for pests')).toBeVisible();
  await expect(panel.getByText('Feed')).toBeVisible();
  return name;
}

test('W3: plant, then check and water from Today; frost guidance appears', async ({ page }) => {
  test.setTimeout(90_000);
  await mockProviders(page, {
    patchForecast: (f) => {
      f.daily.temperature_2m_min[1] = 1;
    },
  });
  await seedPune(page);
  const name = await plantFirst(page);

  await page.goto('/today');
  const cockpit = page.getByTestId('care-cockpit');
  const frost = cockpit.getByTestId('alert-frost');
  await expect(frost).toBeVisible();
  await expect(frost).toContainText('Gardening guidance, not a safety warning.');
  await expect(frost).toContainText(name);

  const task = cockpit.getByTestId('task').filter({ hasText: 'Check soil' }).filter({ hasText: name });
  await expect(task).toBeVisible();
  await expect(task).toContainText('Not checked yet');
  await task.getByRole('button', { name: `Check: ${name}` }).click();
  const sheet = page.getByTestId('check-sheet');
  await sheet.getByRole('radio', { name: 'Dry' }).check();
  await expect(sheet).toContainText('Water now');
  await sheet.getByRole('radio', { name: 'Fine' }).check();
  await sheet.getByRole('button', { name: 'Log watering' }).click();
  await expect(page.getByText('Logged', { exact: true })).toBeVisible();
  await expect(task).toHaveCount(0);
  // The next check moves to a later day this week (from the pot's water balance).
  await expect(cockpit.getByRole('list', { name: 'This week' })).toContainText(`Check soil · ${name}`);
  // Let the confirmation toast finish (axe measures contrast mid-fade otherwise). Toasts pause while
  // the pointer rests on them, so move it away first.
  await page.mouse.move(2, 2);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10_000 });
  await expectNoA11yViolations(page, '/today with care');

  // The watering is in the journal with its amount.
  await page.goto('/garden/journal');
  await expect(page.getByText(/Watered|Water/).first()).toBeVisible();
});

test('skip with a reason, then undo brings the task back', async ({ page }) => {
  await mockProviders(page);
  await seedPune(page);
  const name = await plantFirst(page);
  await page.goto('/today');
  const task = page.getByTestId('task').filter({ hasText: name });
  await task.getByRole('button', { name: 'Skip' }).click();
  await task.getByRole('button', { name: 'Still moist' }).click();
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible();
  await expect(task).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('task').filter({ hasText: name })).toBeVisible();
});

test('Climate Fit shows local climate, seasons and model change; the calendar shows sowing windows', async ({
  page,
}) => {
  await mockProviders(page);
  await seedPune(page);
  await page.goto('/nature');
  await page.getByRole('link', { name: /Climate Fit/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Climate Fit' })).toBeVisible();
  const facts = page.getByTestId('climate-facts');
  await expect(facts).toContainText('Hardiness zone');
  await expect(facts).toContainText('Kharif (monsoon)');
  await expect(page.getByText(/years of ERA5 reanalysis/)).toBeVisible();
  await page.getByRole('button', { name: 'Load projections (about 3 MB)' }).click();
  await expect(page.getByTestId('projection')).toContainText('Average temperature: +');
  await expect(page.getByTestId('projection')).not.toContainText(/SSP|RCP/);
  await expectNoA11yViolations(page, '/nature/climate');

  await page.goto('/plan/calendar');
  const table = page.getByTestId('calendar');
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  await expect(page.getByText(/monthly averages for your place/)).toBeVisible();
  await expectNoA11yViolations(page, '/plan/calendar');
});

test('no page is wider than a phone screen (mobile browsers would zoom the app out)', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'checks the phone layout');
  await mockProviders(page);
  await seedPune(page);
  await plantFirst(page);
  for (const path of [
    '/today',
    '/garden',
    '/plan',
    '/plan/sun',
    '/plan/calendar',
    '/nature',
    '/nature/climate',
    '/settings',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const [inner, client] = await page.evaluate(() => [
      window.innerWidth,
      document.documentElement.clientWidth,
    ]);
    expect(inner, `${path} layout width`).toBe(client);
    expect(inner, `${path} layout width`).toBeLessThanOrEqual(412);
  }
});
