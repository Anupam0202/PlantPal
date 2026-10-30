import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { createGarden, expect, test } from './helpers';
import { connect, ORIGIN, passkeyDevice, server } from './server';

// WebAuthn needs a domain, not an IP: this file runs on localhost (same preview server).
test.use({ baseURL: ORIGIN });

/** The device's active workspace id, read from IndexedDB. */
function activeWorkspace(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('plantpal');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result
            .transaction('meta', 'readonly')
            .objectStore('meta')
            .get('activeWorkspaceId');
          req.onsuccess = () => {
            resolve((req.result as { value: string }).value);
            open.result.close();
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test.skip(({ browserName }) => browserName !== 'chromium', 'The virtual authenticator is Chromium-only');

test('passkey sign-up, back up a garden, plant-sitter link, sign out and back in', async ({
  page,
  browser,
}) => {
  const srv = await server();
  await connect(page, srv);
  const credentials = await passkeyDevice(page);

  // A guest garden with one space and one plant.
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
  await page.goto('/garden/plants/new');
  await page.getByRole('textbox', { name: /^Name/ }).fill('Basil');
  await page.getByRole('combobox', { name: 'Space' }).click();
  await page.getByRole('option', { name: 'South railing' }).click();
  await page.getByRole('button', { name: 'Add a plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Basil' })).toBeVisible();

  // Sign up with a passkey: no password, no email.
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Account & sync' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Account & sync' })).toBeVisible();
  await expectNoA11yViolations(page, 'account (signed out)');
  await page.getByLabel('Your name').fill('Asha');
  await page.getByRole('button', { name: 'Create account with a passkey' }).click();
  await expect(page.getByText('Signed in as Asha')).toBeVisible();
  expect(await credentials()).toHaveLength(1);

  // Back up this device's garden: it goes up through the validated sync path.
  await page.getByRole('button', { name: 'Back up and sync' }).click();
  await expect(page.getByText('Up to date')).toBeVisible({ timeout: 15_000 });
  const wsId = await activeWorkspace(page);
  const uploaded = await srv.liveRecords(wsId);
  expect(uploaded.map((r) => r.entity).sort()).toEqual(['garden', 'specimen', 'zone']);
  expect(uploaded.find((r) => r.entity === 'specimen')?.record.displayName).toBe('Basil');
  await expectNoA11yViolations(page, 'account (synced)');

  // A plant-sitter link for the railing, this week.
  await page.getByRole('link', { name: 'Sharing' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sharing' })).toBeVisible();
  await expect(page.getByText('Asha')).toBeVisible();
  await page.getByLabel('Sitter’s name or note').fill('Ravi');
  await page.getByRole('checkbox', { name: 'South railing' }).check();
  await page.getByRole('button', { name: 'Create sitter link' }).click();
  const link = page.getByText(/\/sit#/);
  await expect(link).toBeVisible();
  const url = (await link.textContent())!.trim();
  await expectNoA11yViolations(page, 'sharing');

  // The sitter opens it with no account and no garden on their device.
  // Another person's phone: its own browser, storage and cookies.
  const sitterDevice = await browser.newContext({ baseURL: ORIGIN, serviceWorkers: 'block' });
  await sitterDevice.addInitScript(() =>
    localStorage.setItem('pp-prefs', JSON.stringify({ units: 'metric', locale: 'en' })),
  );
  const sitter = await sitterDevice.newPage();
  await connect(sitter, srv);
  await sitter.goto(url);
  await expect(sitter.getByRole('heading', { level: 1, name: 'Looking after Balcony' })).toBeVisible();
  await expect(sitter.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  await sitter.getByRole('button', { name: 'Watered: Basil' }).click();
  await expect(sitter.getByText('Logged. Thank you!')).toBeVisible();
  await expect(sitter.getByText('Done today')).toBeVisible();
  await expectNoA11yViolations(sitter, 'plant-sitter checklist');

  // The owner sees what the sitter logged, then turns the link off.
  await page.getByRole('button', { name: 'What they logged' }).click();
  await expect(page.getByText(/Plant sitter \(Ravi\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.getByText('Turned off')).toBeVisible();
  await sitter.reload();
  await expect(sitter.getByText('This link isn’t active right now', { exact: false })).toBeVisible();

  // The sitter's care reached the owner's device through sync.
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText('Up to date')).toBeVisible();
  await page.goto('/garden/journal');
  await expect(page.getByText(/Plant sitter \(Ravi\)/).first()).toBeVisible();

  // Sign out, then back in with the same passkey.
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByText('Signed in as Asha')).toBeVisible();
  await sitterDevice.close();
});

test('the plant-sitter page explains a broken link', async ({ page }) => {
  const srv = await server();
  await connect(page, srv);
  await page.goto('/sit');
  await expect(page.getByText('This link is incomplete', { exact: false })).toBeVisible();
  await page.goto(`/sit#${'x'.repeat(43)}`);
  await page.reload();
  await expect(page.getByText('This link isn’t active right now', { exact: false })).toBeVisible();
});
