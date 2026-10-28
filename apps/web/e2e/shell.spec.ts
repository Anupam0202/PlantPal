import { expect, test } from '@playwright/test';
import { expectNoA11yViolations } from './axe';

const destinations = [
  { name: 'Today', path: '/today' },
  { name: 'Garden', path: '/garden' },
  { name: 'Plan', path: '/plan' },
  { name: 'Nature', path: '/nature' },
  { name: 'Community', path: '/community' },
];

test('root redirects to Today', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

test('primary navigation reaches every destination and marks the current page', async ({ page }) => {
  await page.goto('/today');
  for (const d of destinations) {
    const nav = page.getByRole('navigation', { name: 'Main navigation' }).filter({ visible: true }).first();
    await nav.getByRole('link', { name: d.name }).click();
    await expect(page).toHaveURL(new RegExp(`${d.path}/?$`));
    await expect(nav.getByRole('link', { name: d.name })).toHaveAttribute('aria-current', 'page');
  }
});

for (const path of [
  '/today',
  '/garden',
  '/plan',
  '/nature',
  '/community',
  '/settings',
  '/welcome',
  '/no-such-page',
]) {
  test(`no automated accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoA11yViolations(page, path);
  });
}

test('unknown routes show a helpful not-found page', async ({ page }) => {
  await page.goto('/definitely/not/here');
  await expect(page.getByRole('heading', { name: 'This path leads nowhere' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to Today' }).click();
  await expect(page).toHaveURL(/\/today$/);
});

test('skip link moves focus to the main content', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard-first check runs on desktop');
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('theme, contrast and language preferences apply and persist', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('switch', { name: 'Increase contrast' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'more');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoA11yViolations(page, 'settings in dark high-contrast');
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('option', { name: 'Español' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('command palette opens with the keyboard and navigates', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut is a desktop affordance; mobile uses the search button');
  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = page.getByPlaceholder('Search pages and commands');
  await expect(input).toBeFocused();
  await input.fill('nature');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/nature\/?$/);
});

test.describe('security headers', () => {
  test.use({ bypassCSP: false });

  test('pages run under the production CSP (incl. Trusted Types) without violations', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (/Content Security Policy|TrustedHTML|TrustedScript|Trusted Type/i.test(msg.text()))
        violations.push(msg.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    for (const path of [
      '/today',
      '/garden',
      '/garden/new',
      '/settings',
      '/settings/data',
      '/dev/design-system',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
    }
    const response = await page.goto('/today');
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(violations).toEqual([]);
  });
});
