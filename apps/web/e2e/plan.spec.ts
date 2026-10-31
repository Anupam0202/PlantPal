import { expectNoA11yViolations } from './axe';
import { expect, test } from './helpers';
import { mockProviders } from './providers';

/** W1: first run to a saved plan, with every step answered (§7, §6.1 acceptance). */
test('W1: a newcomer saves a plan in under 90 seconds', async ({ page }) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  const started = Date.now();

  await page.goto('/welcome');
  await page.getByRole('button', { name: 'Start my plan' }).click();

  await expect(page.getByRole('heading', { name: 'Where will you grow?' })).toBeVisible();
  await page.getByRole('button', { name: 'Balcony' }).click();
  await page.getByRole('button', { name: 'Windowsill or indoors' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Where is it?' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill('Pune');
  await page.getByRole('list', { name: 'Places found' }).getByRole('button', { name: /Pune/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'How much sun does it get?' })).toBeVisible();
  const balcony = page.getByTestId('light-balcony');
  await balcony.getByRole('radio', { name: 'W', exact: true }).check();
  await expect(balcony.getByTestId('light-estimate')).toContainText('h of direct sun');
  await page.getByTestId('light-indoor').getByRole('radio', { name: 'Bright, little direct sun' }).check();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Size and practical limits' })).toBeVisible();
  await page.getByRole('radio', { name: 'Medium (20 L)' }).check();
  await page.getByRole('radio', { name: 'Tap or hose nearby' }).check();
  await page.getByRole('radio', { name: '30 min' }).check();
  await page.getByRole('button', { name: 'Cats' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'What matters most?' })).toBeVisible();
  await page.getByRole('button', { name: 'Grow food' }).click();
  await page.getByRole('button', { name: 'Help pollinators' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Plants that fit' })).toBeVisible();
  await expect(page.getByText('Updated with local climate')).toBeVisible();
  const matches = page.getByTestId('match');
  await expect(matches.first()).toBeVisible();
  expect(await matches.count()).toBeGreaterThanOrEqual(8);
  // A west balcony gets no tomatoes; Lantana is invasive in India; lilies are toxic to cats.
  await expect(page.locator('[data-testid="match"][data-taxon="solanum-lycopersicum-cherry"]')).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: /Excluded \(\d+\): see why/ }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.locator('[data-taxon="lantana-camara"]')).toContainText('Listed as invasive in India');
  await expect(sheet.locator('[data-taxon="lilium-longiflorum"]')).toContainText('Known to be toxic to cats');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your garden is planted' })).toBeVisible();
  expect(Date.now() - started).toBeLessThan(90_000);

  await page.getByRole('link', { name: 'See your next steps' }).click();
  const steps = page.getByTestId('next-steps');
  await expect(steps.getByRole('heading', { name: 'Your next three steps' })).toBeVisible();
  await expect(steps).toContainText(/Get and plant|Plant .* in /);
});

test('W1 with every provider down: the manual path still saves a plan', async ({ page }) => {
  await mockProviders(page, { allDown: true });
  await page.goto('/welcome?step=space');
  await page.getByRole('button', { name: 'Balcony' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill('Pune');
  await expect(page.getByText('Place search needs a connection.', { exact: false })).toBeVisible();
  await page.getByRole('radio', { name: 'Northern' }).check();
  await page.getByRole('radio', { name: 'Never' }).check();
  await page
    .getByRole('group', { name: 'Very hot summers (35 °C or more)?' })
    .getByRole('radio', { name: 'Yes' })
    .check();
  await page.getByRole('button', { name: 'Next' }).click();

  // Without a location, sun cannot be computed from direction; a rough class works.
  await expect(page.getByRole('heading', { name: 'How much sun does it get?' })).toBeVisible();
  await expect(page.getByText('Work it out')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Part sun · 3–6 h' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByRole('heading', { name: 'Plants that fit' })).toBeVisible();
  await expect(page.getByTestId('match').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your garden is planted' })).toBeVisible();
  await page.getByRole('link', { name: 'See your next steps' }).click();
  await expect(page.getByTestId('next-steps')).toContainText('Add your garden’s location');
});

test('light 0 stays 0: "No direct sun" leaves out sun lovers (L21)', async ({ page }) => {
  await mockProviders(page, { allDown: true });
  await page.goto('/welcome?step=space');
  await page.getByRole('button', { name: 'Courtyard or patio' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'Northern' }).check();
  await page.getByRole('radio', { name: 'Light frost' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: 'No direct sun' }).check();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: /Excluded \(\d+\): see why/ }).click();
  await expect(page.getByRole('dialog').locator('[data-taxon="ocimum-basilicum"]')).toContainText(
    'Needs 6 h of direct sun; this spot gets about 0 h.',
  );
});

test('Sun Hours Finder and the Plan page work after onboarding, accessibly', async ({ page }) => {
  await mockProviders(page);
  await page.goto('/welcome?step=space');
  await page.getByRole('button', { name: 'Balcony' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('searchbox', { name: 'Search for a town or area' }).fill('Pune');
  await page.getByRole('list', { name: 'Places found' }).getByRole('button', { name: /Pune/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Save my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Your garden is planted' })).toBeVisible();

  await page.goto('/plan/sun');
  await expect(page.getByRole('heading', { name: 'Sun Hours Finder' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Sun paths over the year/ })).toBeVisible();
  await page.getByRole('radio', { name: 'N', exact: true }).check();
  await expect(page.getByTestId('sun-summary')).toContainText('h of direct sun');
  await page.getByRole('tab', { name: 'What I saw' }).click();
  await page.getByRole('tab', { name: 'Facing' }).click();
  await expectNoA11yViolations(page, 'sun finder');
  await page.getByRole('button', { name: 'Save to this space' }).click();
  await expect(page.getByText('Sun profile saved')).toBeVisible();

  await page.goto('/plan');
  await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
  await expect(page.getByTestId('match').first()).toBeVisible();
  await expectNoA11yViolations(page, 'plan');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await expect(page.getByText(/Plan saved with \d+ plants?/)).toBeVisible();
});
