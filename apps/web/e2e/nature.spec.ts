import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { seedPune } from './gemini';
import { expect, test } from './helpers';
import { mockProviders } from './providers';

/** One FIT count on a typed target flower; taps are { group: times }. */
async function fitCount(page: Page, taps: Record<string, number>, unsure: string[] = []) {
  await page.goto('/nature/count');
  await expect(page.getByRole('heading', { level: 1, name: 'Timed pollinator count' })).toBeVisible();
  await page.getByLabel('Flower name').fill('Marigold');
  await page.getByLabel('Flowers in the patch').fill('20');
  await expect(page.getByText('Filled in from the forecast').first()).toBeVisible();
  await page.getByRole('button', { name: 'Start 10-minute count' }).click();
  await expect(page.getByTestId('fit-timer')).toHaveText('10:00');
  const counters = page.getByTestId('fit-counters');
  for (const [group, n] of Object.entries(taps))
    for (let i = 0; i < n; i++)
      await counters.getByRole('button', { name: new RegExp(`^Add one ${group}`) }).click();
  await page.clock.fastForward('10:01');
  const review = page.getByTestId('fit-review');
  await expect(review).toBeVisible();
  for (const g of unsure)
    await review.getByRole('listitem').filter({ hasText: g }).getByText('Not sure').click();
  return review;
}

test('W7: timed pollinator counts with a zero, review, log, trend gate and Darwin Core export', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await mockProviders(page);
  await seedPune(page);

  const review = await fitCount(page, { Bumblebees: 3, Hoverflies: 1 }, ['Hoverflies']);
  await expect(page.getByTestId('fit-total')).toHaveText('3 insects · 15 per 100 flowers');
  await review.getByRole('button', { name: 'Save count' }).click();
  await expect(page).toHaveURL(/\/nature\/log$/);
  const first = page.getByTestId('visits').getByRole('listitem').first();
  await expect(first).toContainText('Pollinator count');
  await expect(first).toContainText('Marigold');
  await expect(first).toContainText('1 not sure');

  // A count with nothing seen is saved and celebrated.
  const zero = await fitCount(page, {});
  await expect(zero).toContainText('A zero is data');
  await zero.getByRole('button', { name: 'Save count' }).click();
  await expect(page).toHaveURL(/\/nature\/log$/);
  await expect(page.getByTestId('visits').getByRole('listitem')).toHaveCount(2);
  await expect(page.getByTestId('visits')).toContainText('0 insects');

  // Two counts are history, not a trend.
  await expect(page.getByTestId('trend')).toContainText('Not enough comparable counts for a trend (2 of 3)');

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Darwin Core CSV' }).click(),
  ]);
  const text = await readFile((await csv.path())!, 'utf8');
  expect(text).toContain('occurrenceStatus');
  expect(text).toMatch(/,present,/);
  expect(text).toMatch(/,absent,/);
  expect(text).toContain('Flower-Insect Timed Count');
  // Coordinates are coarsened to two decimals.
  expect(text).not.toMatch(/\d+\.\d{3,},\d/);

  await expectNoA11yViolations(page);
});

test('Lens, Bloom Bridge and four-state phenology checks with catalogue plants', async ({ page }) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  await seedPune(page);
  for (const id of ['ocimum-tenuiflorum', 'lantana-camara', 'ocimum-basilicum']) {
    await page.goto(`/species/${id}`);
    await page.getByRole('button', { name: 'I grow this' }).click();
    await expect(page).toHaveURL(/\/garden\/plants\//);
  }

  await page.goto('/nature/lens');
  // Planned plants are included too, so an invasive is flagged before it is planted.
  await expect(page.getByTestId('lens-counts')).toContainText('listed invasive');
  const lantana = page.getByTestId('lens').getByRole('listitem').filter({ hasText: 'Lantana' }).first();
  await expect(lantana).toContainText('Listed invasive');
  await expect(lantana).toContainText('do not share cuttings or seeds');
  const tulsi = page.getByTestId('lens').getByRole('listitem').filter({ hasText: 'tulsi' }).first();
  await expect(tulsi).toContainText('Native');
  const basil = page
    .getByTestId('lens')
    .getByRole('listitem')
    .filter({ hasText: /^Basil/ })
    .first();
  await expect(basil).toContainText('No source in the catalogue covers this plant for your region.');
  await expect(page.locator('main')).not.toContainText(/not invasive/i);
  await expectNoA11yViolations(page);

  await page.goto('/nature/bloom');
  await expect(page.getByTestId('bloom-wheel')).toBeVisible();
  await expect(page.getByTestId('bloom-gaps')).toContainText('Hunger gaps');
  await expect(page.getByTestId('bloom-gaps')).toContainText('January');
  await expect(page.getByTestId('bloom-table').getByRole('row')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: 'Fill the gap' })).toBeVisible();
  await expectNoA11yViolations(page);

  await page.goto('/nature/phenology');
  const card = page.getByTestId('pheno-plant').filter({ hasText: 'tulsi' }).first();
  await card
    .getByRole('group', { name: /Flowers$/ })
    .getByRole('button', { name: 'Yes', exact: true })
    .click();
  await card
    .getByRole('group', { name: /Fruit$/ })
    .getByRole('button', { name: 'No', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save checks' }).click();
  await expect(page.getByText('Checks saved for 1 plant').first()).toBeVisible();
  await expect(page).toHaveURL(/\/nature\/log$/);
  const entry = page.getByTestId('visits').getByRole('listitem').first();
  await expect(entry).toContainText('Phenology check');
  await expect(entry).toContainText('Flowers: Yes');
  await expect(entry).toContainText('Fruit: No');
  await expect(entry).not.toContainText('Buds');
});

test('harvest to pantry with separate totals, use-soon on Today, and the Impact Ledger', async ({ page }) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  await seedPune(page);
  await page.goto('/garden/harvest');
  await expect(page.getByRole('link', { name: 'Harvest' })).toHaveAttribute('aria-current', 'page');

  await page.getByLabel('What did you pick?').fill('Cherry tomatoes');
  await page.getByLabel('Amount').fill('450');
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
  await page.getByLabel('Use by (optional)').fill(tomorrow);
  await page.getByRole('button', { name: 'Save harvest' }).click();
  await expect(page.getByText('Harvest saved').first()).toBeVisible();
  await expect(page.getByTestId('harvest-totals')).toContainText('0.45 kg');

  await page.getByLabel('What did you pick?').fill('Coriander');
  await page.getByRole('button', { name: 'Count', exact: true }).click();
  await page.getByLabel('Amount').fill('3');
  await page.getByLabel('Counted as').fill('bunches');
  await page.getByRole('button', { name: 'Save harvest' }).click();
  await expect(page.getByTestId('harvest-totals')).toContainText('0.45 kg · 3 bunches');
  await expect(page.getByTestId('pantry-item')).toHaveCount(2);

  await page.getByRole('combobox', { name: 'Move to: Coriander' }).click();
  await page.getByRole('option', { name: 'Given away' }).click();
  await expect(page.getByText('Marked given away').first()).toBeVisible();
  await expect(page.getByTestId('pantry').getByTestId('pantry-item')).toHaveCount(1);
  await expectNoA11yViolations(page);

  await page.goto('/today');
  await expect(page.getByText('Use soon').first()).toBeVisible();
  await expect(page.getByText(/Cherry tomatoes/).first()).toBeVisible();

  await page.goto('/nature/impact');
  const ledger = page.getByTestId('ledger');
  await expect(ledger.locator('[data-metric="food-mass"]')).toContainText('0.45 kg');
  await expect(ledger.locator('[data-metric="food-count"]')).toContainText('3 bunches');
  await expect(ledger.locator('[data-metric="carbon"]')).toContainText('Not estimated');
  await expect(ledger.locator('[data-metric="canopy-area"]')).toContainText(/Unknown|m²/);
  await expectNoA11yViolations(page);
});

test('nature nearby sends only a rounded point and says records reflect effort', async ({ page }) => {
  test.setTimeout(90_000);
  const { sent } = await mockProviders(page);
  await seedPune(page);
  await page.goto('/nature/nearby');
  await expect(page.getByText('Records reflect where people looked').first()).toBeVisible();
  await expect(page.getByTestId('nearby-birds')).toContainText('House sparrow');
  await expect(page.getByTestId('nearby-insects')).toContainText('Asian honey bee');
  await expect(page.getByTestId('nearby-insects')).not.toContainText('Apidae');
  await expect(page.getByTestId('nearby-gbif')).toContainText('Only openly licensed records');
  const inat = sent.filter((u) => new URL(u).host === 'api.inaturalist.org');
  expect(inat.length).toBeGreaterThan(0);
  for (const u of inat) {
    const q = new URL(u).searchParams;
    expect(q.get('lat')).toMatch(/^-?\d+(\.\d{1,2})?$/);
    expect(q.get('lng')).toMatch(/^-?\d+(\.\d{1,2})?$/);
  }
  await page.getByRole('button', { name: '5 km' }).click();
  await expect
    .poll(() =>
      sent.some(
        (u) => new URL(u).host === 'api.inaturalist.org' && new URL(u).searchParams.get('radius') === '5',
      ),
    )
    .toBe(true);
  await expectNoA11yViolations(page);
});
