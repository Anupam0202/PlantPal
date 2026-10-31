import { expectNoA11yViolations } from './axe';
import { addPlant, createGarden, expect, test } from './helpers';

test('save seeds from a plant, test germination, grow the next generation and see the family tree', async ({
  page,
}) => {
  await createGarden(page, 'Balcony');
  await addPlant(page, 'Grandma tomato');

  await page.getByRole('link', { name: 'Save seeds from this plant' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Seed library' })).toBeVisible();
  await page.getByLabel('How many').fill('120');
  await page.getByLabel('Stored where and how').fill('Paper envelope, cool cupboard');
  await page.getByRole('button', { name: 'Save seed lot' }).click();
  await expect(page.getByText('Seed lot saved')).toBeVisible();
  await expectNoA11yViolations(page, 'seed library');

  await page.getByRole('link', { name: /Grandma tomato seeds/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Grandma tomato seeds' })).toBeVisible();
  await expect(page.getByText('Not tested yet')).toBeVisible();
  await page.getByLabel('Tested on').fill('2026-10-01');
  await page.getByLabel('Sown').fill('10');
  await page.getByLabel('Sprouted').fill('8');
  await page.getByRole('button', { name: 'Add germination test' }).click();
  await expect(page.getByText('80% sprouted')).toBeVisible();
  await expect(page.getByText('8 of 10 sprouted')).toBeVisible();
  await expectNoA11yViolations(page, 'seed lot');

  await page.getByRole('link', { name: 'Grow a plant from this lot' }).click();
  await expect(page.getByText('Grown from seed lot “Grandma tomato seeds”')).toBeVisible();
  await page.getByRole('textbox', { name: /^Name/ }).fill('Tomato, second generation');
  await page.getByRole('button', { name: 'Add a plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tomato, second generation' })).toBeVisible();

  const family = page.getByRole('navigation', { name: 'Came from' });
  await expect(family.getByRole('link', { name: 'Grandma tomato', exact: true })).toBeVisible();
  await expect(family.getByRole('link', { name: 'Seed lot: Grandma tomato seeds' })).toBeVisible();

  await family.getByRole('link', { name: 'Grandma tomato', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Grandma tomato' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tomato, second generation' })).toBeVisible();
});
