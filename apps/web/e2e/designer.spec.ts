import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations } from './axe';
import { GEMINI, mockGemini, saveKey, seedPune } from './gemini';
import { expect, jpegWithGps, test } from './helpers';
import { mockProviders } from './providers';

/** Presses Enter on a control, so the whole flow runs without a pointer. */
async function press(page: Page, name: string | RegExp) {
  const b = page.getByRole('button', { name, exact: typeof name === 'string' });
  await b.focus();
  await page.keyboard.press('Enter');
}

/** Replaces a number field's value by typing, then commits it with Tab. */
async function typeNumber(page: Page, label: string, value: string) {
  const input = page.getByLabel(label, { exact: true });
  await input.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(value);
  await page.keyboard.press('Tab');
}

async function newLayout(page: Page, name: string) {
  await page.goto('/plan');
  const link = page.getByRole('link', { name: 'Space designer' });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Space designer' })).toBeVisible();
  await page.getByLabel('Layout name').focus();
  await page.keyboard.type(name);
  await typeNumber(page, 'Width (m)', '3');
  await typeNumber(page, 'Depth (m)', '1.5');
  await press(page, 'Create layout');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('W6: a layout built with the keyboard alone, checked, saved and versioned', async ({ page }) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  await seedPune(page);
  await newLayout(page, 'Balcony plan');

  // A pot, typed into place.
  await press(page, 'Add pot');
  await expect(page.getByTestId('inspector')).toContainText('Properties: Pot');
  await typeNumber(page, 'x (m)', '0.5');
  await typeNumber(page, 'y (m)', '0.5');
  const pot = page.locator('[data-item="container"]');
  await expect(pot).toHaveAttribute('aria-label', 'Pot at 0.5 m, 0.5 m');

  // A plant goes into the selected pot, then gets a species.
  await press(page, 'Add plant');
  await expect(page.getByTestId('inspector')).toContainText('Properties: Plant');
  await expect(page.locator('[data-item="plant"]')).toHaveAttribute('aria-label', /at 0\.5 m, 0\.5 m$/);

  // Arrow keys move the focused item 10 cm; Alt moves 50 cm; undo puts it back.
  await pot.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Alt+ArrowDown');
  await expect(pot).toHaveAttribute('aria-label', 'Pot at 0.7 m, 1 m');
  // The plant moves with its pot.
  await expect(page.locator('[data-item="plant"]')).toHaveAttribute('aria-label', /at 0\.7 m, 1 m$/);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pot).toHaveAttribute('aria-label', 'Pot at 0.7 m, 0.5 m');

  // A path that is too narrow is flagged in Checks.
  await press(page, 'Add path');
  await typeNumber(page, 'Width (m)', '0.4');
  await expect(page.getByTestId('checks')).toContainText('This path is 40 cm wide; keep at least 60 cm');

  // Weight estimate with its caveat.
  await expect(page.getByTestId('load')).toContainText('kg over 4.5 m²');
  await expect(page.getByTestId('checks')).toContainText('Not a structural assessment');

  // The table view has every item with exact numbers.
  const tab = page.getByRole('tab', { name: 'Table' });
  await tab.focus();
  await page.keyboard.press('Enter');
  const table = page.getByTestId('layout-table');
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table).toContainText('⌀ 0.3 · d 0.25');

  // Save a version, change something, save again and compare.
  await press(page, 'Save version');
  await expect(page.getByText('Version saved').first()).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await press(page, 'Add raised bed');
  await expect(page.getByText('Unsaved changes').first()).toBeVisible();
  await page.getByLabel('What changed? (optional)').fill('Added a bed');
  await press(page, 'Save version');
  await expect(page.getByTestId('versions')).toContainText('Version 3');
  await press(page, 'Compare with version 2');
  await expect(page.getByTestId('compare')).toContainText('1 added');

  // The shopping list counts what to buy.
  await expect(page.getByTestId('shopping')).toContainText('1 × Pot ⌀ 30 cm');

  await expectNoA11yViolations(page);

  // Reloading keeps the saved layout.
  await page.reload();
  await expect(page.locator('[data-item="bed"]')).toHaveCount(1);
});

test('layout export round-trip: JSON re-imports to the same items; SVG has scale and north', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mockProviders(page);
  await seedPune(page);
  await newLayout(page, 'Roof garden');
  // Turn the rectangle into a five-corner outline; a crossing outline is flagged and cannot be saved.
  await press(page, 'Add a corner after corner 2');
  await typeNumber(page, 'Corner 3 x (m)', '-1');
  await expect(page.getByTestId('outline-editor')).toContainText('The outline crosses itself');
  await expect(page.getByRole('button', { name: 'Save version' })).toBeDisabled();
  await typeNumber(page, 'Corner 3 x (m)', '2');
  await expect(page.getByTestId('outline-editor')).not.toContainText('The outline crosses itself');
  await press(page, 'Add raised bed');
  await press(page, 'Add rain tank');
  await press(page, 'Add railing');
  await press(page, 'Save version');
  await expect(page.getByText('Version saved').first()).toBeVisible();

  const [json] = await Promise.all([page.waitForEvent('download'), press(page, 'JSON (local metric frame)')]);
  const text = await readFile((await json.path())!, 'utf8');
  const exported = JSON.parse(text) as {
    type: string;
    frame: { frame: string; unit: string };
    outline: number[][];
    items: Array<{ kind: string }>;
  };
  expect(exported.type).toBe('plantpal-layout');
  expect(exported.frame).toMatchObject({ frame: 'local-metric', unit: 'm' });
  expect(exported.items.map((i) => i.kind).sort()).toEqual(['bed', 'railing', 'tank']);
  expect(exported.outline).toEqual([
    [0, 0],
    [3, 0],
    [2, 0.75],
    [3, 1.5],
    [0, 1.5],
  ]);

  const [svg] = await Promise.all([page.waitForEvent('download'), press(page, 'SVG drawing')]);
  const drawing = await readFile((await svg.path())!, 'utf8');
  expect(drawing).toContain('<svg');
  expect(drawing).toMatch(/>N</);
  expect(drawing).toMatch(/1 m/);

  // A GeoJSON file is refused with a clear message.
  await page.getByTestId('layout-import').setInputFiles({
    name: 'map.geojson',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [] })),
  });
  await expect(page.getByText(/Map files \(GeoJSON\) have no local scale/).first()).toBeVisible();

  // The JSON comes back as a new layout with the same items.
  const before = page.url();
  await page.getByTestId('layout-import').setInputFiles({
    name: 'roof.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.getByText('Layout imported').first()).toBeVisible();
  await expect.poll(() => page.url()).not.toBe(before);
  await expect(page.getByRole('heading', { level: 1, name: 'Roof garden' })).toBeVisible();
  await expect(page.locator('[data-item="bed"]')).toHaveCount(1);
  await expect(page.locator('[data-item="tank"]')).toHaveCount(1);
  await expect(page.locator('[data-item="railing"]')).toHaveCount(1);
});

test('F9 Photo-to-Plan (Labs): marks items, scales from one width and places drafts', async ({ page }) => {
  test.setTimeout(120_000);
  await mockProviders(page);
  await mockGemini(page);
  const sent: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(GEMINI) && r.method() === 'POST') sent.push(r.postData() ?? '');
  });
  await seedPune(page);
  await saveKey(page);
  await newLayout(page, 'Photo balcony');
  // Off by default: nothing to see until Labs is switched on.
  await expect(page.getByTestId('photo-plan')).toHaveCount(0);
  const editor = page.url();

  await page.goto('/settings/ai');
  await page.getByRole('switch', { name: 'Photo-to-Plan' }).click();
  await page.goto(editor);
  const panel = page.getByTestId('photo-plan');
  await expect(panel).toBeVisible();

  const photo = await jpegWithGps(page);
  await panel
    .getByTestId('photo-plan-input')
    .setInputFiles({ name: 'b.jpg', mimeType: 'image/jpeg', buffer: photo });
  await panel.getByRole('button', { name: 'Mark items with AI' }).click();
  // The send preview lists the photo; nothing leaves before Send.
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await expect(preview).toContainText('Photo');
  await expect(preview).toContainText('Needed');
  expect(sent).toHaveLength(0);
  await page.getByRole('button', { name: 'Send', exact: true }).click();

  await expect(panel.getByRole('radio')).toHaveCount(3);
  expect(sent).toHaveLength(1);
  // The photo went resized and without its GPS tags.
  expect(sent[0]).not.toContain('GPS');
  await panel.getByRole('radio', { name: /Pot · Terracotta pot/ }).check();
  await panel.getByLabel('Real width (cm)').fill('30');
  await panel.getByRole('button', { name: 'Place draft items' }).click();
  await expect(page.getByText('3 draft items placed. Check their sizes.').first()).toBeVisible();

  await expect(page.locator('[data-item="container"]')).toHaveAttribute('aria-label', /Pot “Terracotta pot”/);
  await expect(page.locator('[data-item="railing"]')).toHaveCount(1);
  await expect(page.locator('[data-item="seating"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(page.getByTestId('layout-table')).toContainText('⌀ 0.3');
  // One undo removes the whole draft.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('layout-table').getByRole('row')).toHaveCount(1);
});
