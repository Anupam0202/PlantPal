import type { Browser, Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { expect, test } from './helpers';
import { createGardenAt, mockProviders } from './providers';
import { connect, ORIGIN, passkeyDevice, server, type TestServer } from './server';

test.use({ baseURL: ORIGIN });
test.skip(({ browserName }) => browserName !== 'chromium', 'The virtual authenticator is Chromium-only');

/** What each phone sent to the API: URL and body. */
const sent = new Map<Page, string[]>();

/** One person's phone: its own browser storage and cookies, a garden in Pune and a passkey. */
async function person(browser: Browser, srv: TestServer): Promise<Page> {
  const device = await browser.newContext({ baseURL: ORIGIN, serviceWorkers: 'block' });
  await device.addInitScript(() =>
    localStorage.setItem('pp-prefs', JSON.stringify({ units: 'metric', locale: 'en' })),
  );
  const page = await device.newPage();
  const log: string[] = [];
  sent.set(page, log);
  page.on('request', (r) => {
    if (r.url().includes('/api/')) log.push(`${r.url()} ${r.postData() ?? ''}`);
  });
  await mockProviders(page);
  await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ status: 503, body: '' }));
  await connect(page, srv);
  await passkeyDevice(page);
  await createGardenAt(page, 'Pune', 'Pune');
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
  return page;
}

/** Signs up from the community page and creates a profile from the garden's rough area. */
async function join(page: Page, name: string) {
  await page.goto('/community');
  await expect(page.getByRole('heading', { name: 'Sign in to join' })).toBeVisible();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Create your community profile' })).toBeVisible();
  await expect(page.getByTestId('community-area')).toContainText('Near Pune');
  await page.getByRole('textbox', { name: /^Display name/ }).fill(name);
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('tab', { name: 'Feed' })).toBeVisible();
}

test('community: profile with a coarse area, posts, a seed swap, reports, moderation and an appeal', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const srv = await server({ community: true });

  // Asha joins. Only a resolution-7 cell (and its resolution-5 area) reaches the server.
  const asha = await person(browser, srv);
  await join(asha, 'Asha');
  const cells = await srv.profileCells();
  expect(cells).toHaveLength(1);
  expect(cells[0]!.cell).toMatch(/^87[0-9a-f]{13}$/);
  expect(cells[0]!.area).toMatch(/^85[0-9a-f]{13}$/);
  await expect(asha.getByText('Nothing posted nearby yet')).toBeVisible();
  await expectNoA11yViolations(asha, 'community feed (empty)');

  await asha
    .getByRole('textbox', { name: 'Share something with growers nearby' })
    .fill('Tulsi is flowering. Free seeds soon!');
  await asha.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(asha.getByText('Tulsi is flowering. Free seeds soon!')).toBeVisible();

  // She offers seeds on the exchange.
  await asha.getByRole('tab', { name: 'Exchange' }).click();
  await asha.getByRole('button', { name: 'Offer something' }).click();
  await asha.getByRole('textbox', { name: /^Title/ }).fill('Tulsi seeds');
  await asha.getByRole('textbox', { name: 'How much' }).fill('About 50');
  await asha.getByRole('textbox', { name: /^Pickup/ }).fill('Library steps, Saturday morning');
  await asha.getByRole('button', { name: 'List it now' }).click();
  await expect(asha.getByRole('heading', { level: 1, name: 'Tulsi seeds' })).toBeVisible();
  await expect(asha.getByTestId('listing-state')).toHaveText('Available');
  const listingUrl = asha.url();

  // Ravi, nearby, asks a question and reserves it.
  const ravi = await person(browser, srv);
  await join(ravi, 'Ravi');
  await expect(ravi.getByText('Tulsi is flowering. Free seeds soon!')).toBeVisible();
  await ravi.getByRole('tab', { name: 'Exchange' }).click();
  await ravi.getByRole('link', { name: /Tulsi seeds/ }).click();
  await expect(ravi.getByRole('heading', { level: 1, name: 'Tulsi seeds' })).toBeVisible();
  await ravi
    .getByRole('textbox', { name: 'Ask a question (everyone can read it)' })
    .fill('Are they from this year?');
  await ravi.getByRole('button', { name: 'Send' }).click();
  await expect(ravi.getByText('Are they from this year?')).toBeVisible();
  await ravi.getByRole('button', { name: 'Reserve' }).click();
  await expect(ravi.getByText('You reserved this')).toBeVisible();
  await expect(ravi.getByTestId('listing-state')).toHaveText('Reserved');
  await expectNoA11yViolations(ravi, 'listing (reserved)');

  // Contact details appear only once both have shared one.
  await ravi.getByRole('textbox', { name: 'How to reach me' }).fill('ravi@example.org');
  await ravi.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(ravi.getByText(/Shared\. It appears to the other person/)).toBeVisible();
  await ravi.getByRole('button', { name: 'Confirm the handoff' }).click();
  await expect(ravi.getByText('You confirmed the handoff.')).toBeVisible();

  await asha.goto(listingUrl);
  await expect(asha.getByTestId('listing-state')).toHaveText('Reserved');
  await expect(asha.getByText('ravi@example.org')).toHaveCount(0);
  await asha.getByRole('textbox', { name: 'How to reach me' }).fill('asha@example.org');
  await asha.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(asha.getByTestId('contacts')).toContainText('ravi@example.org');
  await asha.getByRole('button', { name: 'Confirm the handoff' }).click();
  await expect(asha.getByTestId('listing-state')).toHaveText('Handed over');
  await asha.getByRole('button', { name: 'Mark as completed' }).click();
  await expect(asha.getByTestId('listing-state')).toHaveText('Completed');

  // Ravi reports Asha's post; then he is made a moderator and hides it from the queue.
  await ravi.goto('/community');
  await ravi.getByRole('button', { name: 'Report' }).first().click();
  const report = ravi.getByRole('dialog', { name: 'Report this' });
  await report.getByRole('button', { name: 'Send report' }).click();
  await expect(ravi.getByText('Thank you. Moderators will take a look.')).toBeVisible();

  // Not a moderator yet: the page says so.
  await ravi.goto('/admin');
  await expect(ravi.getByText('Only moderators can open this page.')).toBeVisible();
  await srv.setStaff('Ravi', 'moderator');
  await ravi.reload();
  const queue = ravi.getByRole('region', { name: 'Queue' });
  await expect(queue.getByText('Tulsi is flowering. Free seeds soon!')).toBeVisible();
  await expect(queue.getByText('1 open report')).toBeVisible();
  await expectNoA11yViolations(ravi, 'moderation');
  await queue.getByRole('textbox', { name: 'Reason (kept in the audit log)' }).fill('Testing the queue');
  await queue.getByRole('button', { name: 'Hide' }).click();
  await expect(ravi.getByTestId('audit-log')).toContainText('hide');

  // Asha sees the decision and appeals it.
  await asha.goto('/community');
  const notices = asha.getByTestId('moderation-notices');
  await expect(notices.getByText('Hidden')).toBeVisible();
  await expect(notices.getByText('Testing the queue')).toBeVisible();
  await notices.getByRole('button', { name: 'Appeal' }).click();
  await notices
    .getByRole('textbox', { name: 'Why this should be looked at again' })
    .fill('It was a real offer.');
  await notices.getByRole('button', { name: 'Appeal' }).click();
  await expect(notices.getByText('Appeal under review')).toBeVisible();
  await expectNoA11yViolations(asha, 'community with a notice');

  // The moderator reverses the decision: the post is visible again.
  await ravi.reload();
  const appeals = ravi.getByRole('region', { name: 'Appeals' });
  await expect(appeals.getByText('It was a real offer.')).toBeVisible();
  await appeals.getByRole('button', { name: 'Reverse it' }).click();
  await expect(ravi.getByText('No open appeals.')).toBeVisible();
  await asha.reload();
  await expect(asha.getByText('Appeal accepted: decision reversed')).toBeVisible();
  await ravi.goto('/community');
  await expect(ravi.getByText('Tulsi is flowering. Free seeds soon!')).toBeVisible();

  // The map shows nothing while fewer than five people are active in a cell (k-anonymity).
  await ravi.getByRole('tab', { name: 'Map' }).click();
  await expect(ravi.getByText('Not enough active growers to show the map yet')).toBeVisible();
  await expectNoA11yViolations(ravi, 'community map (below the privacy threshold)');

  // Four more active growers in Asha's cell make five: now the cell may be shown, with a count only.
  await srv.seedActiveGrowers(cells[0]!.cell, 3);
  await ravi.reload();
  await expect(ravi.getByText('Not enough active growers to show the map yet')).toBeVisible();
  await srv.seedActiveGrowers(cells[0]!.cell, 4);
  await ravi.reload();
  await expect(ravi.getByTestId('community-cells')).toContainText('5 active growers');
  await expect(ravi.getByRole('region', { name: 'Map of active growers in your area' })).toHaveAttribute(
    'data-map-ready',
    'true',
    { timeout: 20_000 },
  );
  await expectNoA11yViolations(ravi, 'community map');

  // Precise garden coordinates never reached the community server from either phone.
  for (const s of [...sent.get(asha)!, ...sent.get(ravi)!]) expect(s).not.toMatch(/18\.519|73\.855/);
});
