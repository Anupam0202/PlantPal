import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { expect, test } from './helpers';
import { createGardenAt, mockProviders } from './providers';
import { connect, server } from './server';

async function gardenInPune(page: Page) {
  await mockProviders(page);
  // No basemap in tests: the hexagons must still draw and the page must say so.
  await page.route('https://tiles.openfreemap.org/**', (r) => r.fulfill({ status: 503, body: '' }));
  await createGardenAt(page, 'Pune', 'Pune');
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Balcony' })).toBeVisible();
}

interface Sent {
  url: URL;
  body: string;
}

/** Every request the page makes, to prove precise coordinates never leave for the server or Overpass. */
function recordRequests(page: Page) {
  const seen: Sent[] = [];
  page.on('request', (r) => seen.push({ url: new URL(r.url()), body: r.postData() ?? '' }));
  return seen;
}

test.describe('under the production CSP (Trusted Types)', () => {
  test.use({ bypassCSP: false });

  test('corridor map: green space around the garden from a coarse tile, worked out on the device', async ({
    page,
  }) => {
    const seen = recordRequests(page);
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Trusted|Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    await connect(page, await server());
    await gardenInPune(page);

    await page.goto('/nature');
    await page.getByRole('link', { name: /Green corridor/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Green corridor' })).toBeVisible();
    await expect(page.getByTestId('corridor-headline')).toHaveText(
      /Your garden is (a stepping stone .* from the nearest mapped|inside mapped)/,
    );
    await expect(page.getByText(/About \d+% of the area around you is mapped green space/)).toBeVisible();
    await expect(page.getByText('Demo data')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nearest mapped green space' })).toBeVisible();
    await expect(page.getByText(/Riverside Park · park/)).toBeVisible();
    await expect(page.getByText(/not habitat quality/)).toBeVisible();
    await expect(page.getByText('© OpenStreetMap contributors').first()).toBeVisible();

    const map = page.getByRole('region', { name: 'Map of mapped green space around your garden' });
    await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 20_000 });
    await expect(page.getByText(/Background map unavailable/)).toBeVisible();
    // MapLibre's worker started and nothing it did was blocked.
    expect(violations).toEqual([]);

    // Only the coarse cell reached the server; the browser never called Overpass itself.
    const green = seen.filter((s) => s.url.pathname === '/api/v1/env/green-space');
    expect(green.length).toBeGreaterThan(0);
    for (const s of green) expect([...s.url.searchParams.keys()]).toEqual(['cell']);
    for (const s of green) expect(s.url.searchParams.get('cell')).toMatch(/^87[0-9a-f]{13}$/);
    expect(seen.some((s) => s.url.hostname === 'overpass-api.de')).toBe(false);
    const ours = seen.filter((s) => s.url.pathname.startsWith('/api/'));
    for (const s of ours) expect(`${s.url.search} ${s.body}`).not.toMatch(/18\.519|73\.855/);
  });
});

test('corridor map has no automated accessibility violations', async ({ page }) => {
  await connect(page, await server());
  await gardenInPune(page);
  await page.goto('/nature/corridor');
  const map = page.getByRole('region', { name: 'Map of mapped green space around your garden' });
  await expect(map).toHaveAttribute('data-map-ready', 'true', { timeout: 20_000 });
  await expectNoA11yViolations(page, 'corridor map');
});

test('without a server the corridor page explains what it needs', async ({ page }) => {
  await gardenInPune(page);
  await page.goto('/nature/corridor');
  await expect(
    page.getByText('The corridor map needs the PlantPal server, which isn’t available here.'),
  ).toBeVisible();
});
