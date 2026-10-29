import { expectNoA11yViolations } from './axe';
import { mockGemini, saveKey, seedPune } from './gemini';
import { expect, jpegWithGps, test } from './helpers';
import { mockProviders } from './providers';

test('species page: cited facts, toxicity, GBIF match, Wikidata names and openly licensed photos', async ({
  page,
}) => {
  await mockProviders(page);
  await seedPune(page);
  await page.goto('/nature');
  await page.getByRole('link', { name: /Plants A–Z/ }).click();
  await page.getByRole('searchbox', { name: 'Search by name' }).fill('basil');
  await page
    .getByTestId('species-list')
    .getByRole('link', { name: /Ocimum basilicum/ })
    .click();
  await expect(page).toHaveURL(/\/species\/ocimum-basilicum$/);
  await expect(page.getByTestId('species-facts')).toBeVisible();
  await expect(page.getByTestId('species-toxicity')).toContainText(/cats|No cited information/);
  await expect(page.getByTestId('gbif-status')).toContainText('Matched in GBIF as Ocimum basilicum');
  await expect(page.getByText('sweet basil')).toBeVisible();
  const photos = page.getByTestId('species-photos');
  await expect(photos.getByRole('img')).toHaveCount(1); // the CC BY-NC photo is left out
  await expect(photos).toContainText('Example Botanist · CC BY-SA 4.0');
  await expectNoA11yViolations(page, 'species page');

  await page.getByRole('button', { name: 'I grow this' }).click();
  await expect(page).toHaveURL(/\/garden\/plants\/[0-9A-Z]{26}$/);
});

test('F3: a plant not in the catalogue is checked in GBIF and drafted with cited sources for review', async ({
  page,
}) => {
  await mockProviders(page);
  await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  await page.goto('/species');
  const intake = page.getByTestId('species-intake');
  await intake.getByRole('textbox', { name: 'Scientific name' }).fill('Blueberrius fakeus');
  await intake.getByRole('button', { name: 'Check the name' }).click();
  await expect(intake).toContainText('GBIF does not recognise this name');
  await intake.getByRole('textbox', { name: 'Scientific name' }).fill('Salvia hispanica');
  await intake.getByRole('button', { name: 'Check the name' }).click();
  await expect(intake.getByTestId('gbif-match')).toContainText('Salvia hispanica (Lamiaceae)');
  await intake.getByRole('button', { name: 'Draft facts with cited sources' }).click();
  const preview = page.getByRole('region', { name: 'Send to Gemini?' });
  await preview.getByText('Show exactly what is sent').click();
  await expect(preview).toContainText('Plant: Salvia hispanica');
  await preview.getByRole('button', { name: 'Send' }).click();

  await expect(page).toHaveURL(/\/species\/drafts\/[0-9A-Z]{26}$/);
  const traits = page.getByTestId('draft-traits');
  await expect(traits.getByText('AI draft', { exact: true })).toHaveCount(3);
  await expect(traits).toContainText('extension.example.edu');
  await expect(traits).toContainText('Toxicity and edibility are never accepted from an AI draft.');
  await traits.getByRole('button', { name: 'Accept' }).first().click();
  await expect(traits.getByText('Accepted', { exact: true })).toBeVisible();
  await expectNoA11yViolations(page, 'species draft');
  await page.getByRole('button', { name: 'Delete draft' }).click();
  await expect(page).toHaveURL(/\/species$/);
});

test('F5: photo ID shows only GBIF-confirmed names and links the catalogue', async ({ page }) => {
  await mockProviders(page);
  await mockGemini(page);
  await seedPune(page);
  await saveKey(page);
  await page.goto('/garden/plants/new');
  await page
    .getByTestId('photo-input')
    .setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await page.getByRole('button', { name: 'Identify from a photo' }).click();
  await page.getByRole('region', { name: 'Send to Gemini?' }).getByRole('button', { name: 'Send' }).click();
  const id = page.getByTestId('photo-id');
  await expect(id).toContainText('Ocimum tenuiflorum');
  await expect(id).not.toContainText('Fakeus plantus');
  await expect(id).toContainText('1 suggestion was not found in GBIF and was left out.');
  await id.getByRole('button', { name: 'Use this name' }).click();
  await expect(page.getByRole('textbox', { name: /Scientific name/ })).toHaveValue('Ocimum tenuiflorum');
  await expect(page.getByTestId('catalogue-link')).toContainText('Linked to the catalogue');
  await page.getByRole('button', { name: 'Add a plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Holy basil' })).toBeVisible();
});
