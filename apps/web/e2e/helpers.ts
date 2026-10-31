import { expect, test as base, type Page } from '@playwright/test';

/** Tests pin metric units and English so expectations do not depend on the browser locale. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('pp-prefs'))
        localStorage.setItem('pp-prefs', JSON.stringify({ units: 'metric', locale: 'en' }));
    });
    await use(page);
  },
});
export { expect };

/** Builds a JPEG that carries EXIF with a description and GPS position, to prove they are stripped. */
export async function jpegWithGps(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 1200;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const g = ctx.createLinearGradient(0, 0, 1600, 1200);
    g.addColorStop(0, '#2f6b3a');
    g.addColorStop(1, '#e8d38a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1600, 1200);
    return c.toDataURL('image/jpeg', 0.9);
  });
  const jpeg = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');

  const marker = Buffer.from('PLANTPAL-SECRET-GPS-18.52N\0', 'latin1');
  // TIFF (big-endian): header(8) + IFD0 with 2 entries (2 + 2*12 + 4) + GPS IFD with 1 entry (2 + 12 + 4) + marker.
  const ifd0At = 8;
  const gpsAt = ifd0At + 2 + 24 + 4;
  const markerAt = gpsAt + 2 + 12 + 4;
  const tiff = Buffer.alloc(markerAt + marker.length);
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(ifd0At, 4);
  tiff.writeUInt16BE(2, ifd0At);
  // ImageDescription (0x010E), ASCII
  tiff.writeUInt16BE(0x010e, ifd0At + 2);
  tiff.writeUInt16BE(2, ifd0At + 4);
  tiff.writeUInt32BE(marker.length, ifd0At + 6);
  tiff.writeUInt32BE(markerAt, ifd0At + 10);
  // GPSInfo pointer (0x8825), LONG
  tiff.writeUInt16BE(0x8825, ifd0At + 14);
  tiff.writeUInt16BE(4, ifd0At + 16);
  tiff.writeUInt32BE(1, ifd0At + 18);
  tiff.writeUInt32BE(gpsAt, ifd0At + 22);
  tiff.writeUInt32BE(0, ifd0At + 26);
  // GPS IFD: GPSLatitudeRef 'N'
  tiff.writeUInt16BE(1, gpsAt);
  tiff.writeUInt16BE(0x0001, gpsAt + 2);
  tiff.writeUInt16BE(2, gpsAt + 4);
  tiff.writeUInt32BE(2, gpsAt + 6);
  tiff.write('N\0', gpsAt + 10, 'latin1');
  tiff.writeUInt32BE(0, gpsAt + 14);
  marker.copy(tiff, markerAt);

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}

/** Reads every stored photo (full size) from IndexedDB. */
export async function storedPhotos(page: Page): Promise<Array<{ type: string; bytes: number[] }>> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('plantpal');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('mediaBlobs', 'readonly');
          const req = tx.objectStore('mediaBlobs').getAll();
          req.onsuccess = async () => {
            const rows = req.result as Array<{ full: Blob }>;
            resolve(
              await Promise.all(
                rows.map(async (r) => ({
                  type: r.full.type,
                  bytes: Array.from(new Uint8Array(await r.full.arrayBuffer())),
                })),
              ),
            );
            open.result.close();
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

export async function createGarden(page: Page, name = 'Balcony') {
  await page.goto('/garden/new');
  await expect(page.getByRole('heading', { level: 1, name: 'New garden' })).toBeVisible();
  await page.getByLabel('Garden name').fill(name);
  await page.getByRole('button', { name: 'Create a garden' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export async function addPlant(page: Page, name: string, opts: { photo?: Buffer } = {}) {
  await page.goto('/garden/plants/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add a plant' })).toBeVisible();
  await page.getByRole('textbox', { name: /^Name/ }).fill(name);
  if (opts.photo) {
    await page
      .getByTestId('photo-input')
      .setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: opts.photo });
    await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Add a plant' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
