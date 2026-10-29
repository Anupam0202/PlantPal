import { expect, test } from './helpers';
import { createGardenAt, mockProviders } from './providers';
import { expectNoA11yViolations } from './axe';

test('location search sets place, time zone and hemisphere, and Today shows local conditions with provenance', async ({
  page,
}) => {
  const { sent } = await mockProviders(page);
  await createGardenAt(page, 'Pune', 'Pune');
  await expect(page.getByText('18.52° N, 73.86° E')).toBeVisible();
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();

  await page.goto('/today');
  const sky = page.getByRole('region', { name: 'Outside now' });
  await expect(sky.getByText(/°$/).first()).toBeVisible();
  await expect(sky.getByText('Up to date')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next 7 days' })).toBeVisible();
  const air = page
    .getByRole('heading', { name: 'Air quality' })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await expect(air.getByText('87')).toBeVisible();
  await expect(air.getByText('Moderate')).toBeVisible();
  await expect(
    page.getByText('Pollen forecasts are not available here (they cover Europe only).'),
  ).toBeVisible();
  await expect(page.getByText('559')).toBeVisible();
  await expect(page.getByRole('img', { name: /Sun energy by month/ })).toBeVisible();

  await sky.getByRole('button', { name: 'Source' }).click();
  const sheet = page.getByRole('dialog', { name: 'Where this comes from' });
  await expect(sheet.getByText('Weather data by Open-Meteo.com')).toBeVisible();
  await expect(sheet.getByText('18.50° N, 73.85° E (≈0.05°)')).toBeVisible();
  await expect(sheet.getByText(/CC BY 4.0/)).toBeVisible();

  // Privacy: only rounded coordinates ever leave the device.
  const weatherCalls = sent.filter((u) => !u.includes('geocoding'));
  expect(weatherCalls.length).toBeGreaterThan(0);
  for (const u of weatherCalls) expect(u).not.toMatch(/18\.519|73\.855/);
});

test('L06/L07: one failing source shows its own state and can be retried without blocking the rest', async ({
  page,
}) => {
  const { state } = await mockProviders(page, { airDown: true });
  await createGardenAt(page, 'Pune', 'Pune');
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
  await page.goto('/today');
  await expect(page.getByRole('region', { name: 'Outside now' }).getByText('Up to date')).toBeVisible();
  const airHeading = page.getByRole('heading', { name: 'Air quality' });
  const air = airHeading.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');
  await expect(air.getByText('Unavailable')).toBeVisible();
  state.airDown = false;
  await air.getByRole('button', { name: 'Retry' }).click();
  await expect(air.getByText('Moderate')).toBeVisible();
});

test('L12: southern-hemisphere places are formatted and treated correctly', async ({ page }) => {
  await mockProviders(page);
  await createGardenAt(page, 'Syd', 'Sydney');
  await expect(page.getByText('33.87° S, 151.21° E')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Southern', pressed: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create a garden' }).click();
  // Wait for the save to finish before navigating away.
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
  await page.goto('/garden/edit');
  await expect(page.getByText('Australia/Sydney')).toBeVisible();
});

test('the data sources page reports provider health, and weather pages pass accessibility checks', async ({
  page,
}) => {
  await mockProviders(page);
  await createGardenAt(page, 'Pune', 'Pune');
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
  await page.goto('/today');
  await expect(page.getByRole('region', { name: 'Outside now' }).getByText('Up to date')).toBeVisible();
  await expect(page.getByText('Moderate')).toBeVisible();
  await expectNoA11yViolations(page, '/today with conditions');
  await page.goto('/settings/sources');
  await expect(page.getByText(/directly and sends only an approximate area/)).toBeVisible();
  await expectNoA11yViolations(page, '/settings/sources');
});

test.describe('under the production CSP', () => {
  test.use({ bypassCSP: false });

  test('provider calls are allowed by connect-src and cause no violations', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Trusted Type|CSP violation/i.test(m.text())) violations.push(m.text());
    });
    await mockProviders(page);
    await createGardenAt(page, 'Pune', 'Pune');
    await page.getByRole('button', { name: 'Create a garden' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
    await page.goto('/today');
    await expect(page.getByText('Moderate')).toBeVisible();
    expect(violations).toEqual([]);
  });
});
