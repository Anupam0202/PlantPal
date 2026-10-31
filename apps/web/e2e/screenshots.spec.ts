import { mkdirSync } from 'node:fs';
import { addPlant, expect, test } from './helpers';
import { seedPune } from './gemini';
import { mockProviders } from './providers';

/**
 * README screenshots from the real app with demo weather data. Not part of the normal run:
 *   SCREENSHOTS=1 pnpm exec playwright test e2e/screenshots.spec.ts
 */
const OUT = new URL('../../../docs/screenshots/', import.meta.url).pathname;

test.skip(!process.env.SCREENSHOTS, 'Only when SCREENSHOTS=1');

test('capture README screenshots', async ({ page, isMobile }) => {
  mkdirSync(OUT, { recursive: true });
  const shot = (name: string) =>
    page.screenshot({ path: `${OUT}${name}-${isMobile ? 'mobile' : 'desktop'}.png` });
  await mockProviders(page);
  await seedPune(page);
  await addPlant(page, 'Basil');

  await page.goto('/today');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot('today');

  await page.goto('/plan');
  await page.waitForLoadState('networkidle');
  await shot('plan');

  await page.goto('/nature');
  await page.waitForLoadState('networkidle');
  await shot('nature');

  await page.goto('/nature/stamps');
  await page.waitForLoadState('networkidle');
  await shot('stamps');

  await page.goto('/garden');
  await page.waitForLoadState('networkidle');
  await shot('garden');
});
