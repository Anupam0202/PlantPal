import { readFile } from 'node:fs/promises';
import { expectNoA11yViolations } from './axe';
import { createGarden, expect, test } from './helpers';

test('field stamps, a lesson, the Garden Story and printable labels all come from the records', async ({
  page,
}) => {
  await createGarden(page, 'Balcony');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Nothing earned yet: no streaks, nothing to lose.
  await page.goto('/nature/stamps');
  await expect(page.getByRole('heading', { level: 1, name: 'Field stamps' })).toBeVisible();
  await expect(page.getByTestId('stamp-first-roots')).toHaveAttribute('data-earned', '0');
  await expect(page.getByTestId('stamp-soil-builder')).toContainText(
    'PlantPal does not keep these records yet.',
  );

  // A plant with a planted date earns First Roots.
  await page.goto('/garden/plants/new');
  await page.getByRole('textbox', { name: /^Name/ }).fill('Basil');
  await page.getByLabel('Planted or sown on').fill(today);
  await page.getByRole('button', { name: 'Add a plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Basil' })).toBeVisible();
  await page.goto('/nature/stamps');
  await expect(page.getByTestId('stamp-first-roots')).toHaveAttribute('data-earned', '1');
  await expect(page.getByText('New stamp: First Roots')).toBeVisible();
  await expectNoA11yViolations(page, 'field stamps');

  // A field lesson with one question.
  await page.goto('/learn');
  await page.getByRole('link', { name: /Watering by touch/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Watering by touch' })).toBeVisible();
  await page.getByRole('radio', { name: 'Water anyway, because the task is due' }).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Not quite.')).toBeVisible();
  await page.getByRole('radio', { name: 'Mark it checked and look again in a day or two' }).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('That’s right. Lesson complete')).toBeVisible();
  await expectNoA11yViolations(page, 'lesson');
  await page.goto('/nature/stamps');
  await expect(page.getByTestId('stamp-field-scholar')).toContainText('1 of 5 lessons');

  // The year's story, from the records, saved as an image.
  await page.goto('/nature/story');
  await expect(page.getByRole('heading', { name: 'First plantings' })).toBeVisible();
  await expect(page.getByText('Basil')).toBeVisible();
  await expectNoA11yViolations(page, 'garden story');
  const image = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save as image' }).click();
  const png = await readFile((await (await image).path())!);
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

  // Printable labels with a QR code, as a PDF made on the device.
  await page.goto('/garden');
  await page
    .getByRole('navigation', { name: 'Garden sections' })
    .getByRole('link', { name: 'Labels' })
    .click();
  await expect(page.getByRole('heading', { name: 'Plant labels' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Basil' })).toBeChecked();
  await expectNoA11yViolations(page, 'labels');
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Make labels (PDF)' }).click();
  const file = await pdf;
  expect(file.suggestedFilename()).toBe('plantpal-labels-front.pdf');
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(bytes.toString('latin1')).toContain('/Filter /DCTDecode');
});
