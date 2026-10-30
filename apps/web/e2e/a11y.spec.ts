import { expectNoA11yViolations } from './axe';
import { createGarden, expect, test } from './helpers';

/** §11: reflow at 320 px, forced colours, 200% text and a visible focus ring on every tab stop. */
const CORE = ['/today', '/garden', '/plan', '/nature', '/community', '/settings', '/learn', '/copilot'];

test.describe('accessibility beyond automated rules (§11)', () => {
  test.skip(({ isMobile }) => isMobile, 'viewport is set per test');

  test('core pages reflow at 320 CSS px without sideways scrolling', async ({ page }) => {
    await createGarden(page, 'Balcony');
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of CORE) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${path} layout width`).toBeLessThanOrEqual(320);
    }
  });

  test('text at 200% still fits a phone width', async ({ page }) => {
    await createGarden(page, 'Balcony');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/today', '/garden', '/plan']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `${path} at 200% text`).toBeLessThanOrEqual(390);
    }
  });

  test('forced-colours mode keeps pages usable', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await createGarden(page, 'Balcony');
    for (const path of ['/today', '/plan', '/nature/stamps']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // axe reads the theme's colours, not the system palette the browser paints with in this mode,
      // so its contrast rule cannot judge it; every other rule still runs.
      await expectNoA11yViolations(page, `${path} (forced colours)`, { disable: ['color-contrast'] });
    }
  });

  test('every keyboard stop on Today shows a focus indicator and nothing traps focus', async ({ page }) => {
    await createGarden(page, 'Balcony');
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
    const seen = new Set<string>();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
        return {
          id: `${el.tagName}:${el.textContent?.trim().slice(0, 30) ?? ''}:${el.getAttribute('aria-label') ?? ''}`,
          ring,
        };
      });
      if (!info) continue;
      expect(info.ring, `focus indicator on ${info.id}`).toBe(true);
      seen.add(info.id);
    }
    // Focus moves through many distinct controls, so it is not trapped.
    expect(seen.size).toBeGreaterThan(5);
  });
});
