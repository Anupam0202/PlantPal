// @vitest-environment node
// Data-layer tests run in Node so IndexedDB stores real Blobs (happy-dom Blobs are not cloneable).
import { beforeEach, describe, expect, it } from 'vitest';
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate';
import { applyImport, buildArchive, buildCsvExport, ImportError, readArchive } from '../../src/data/archive';
import { createGarden, createSpecimen, logCare, storeImage, updateSpecimen } from '../../src/data/commands';
import { db } from '../../src/data/db';
import { fakeProcess, resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 27, 9);

async function seed() {
  const g = await createGarden(
    { name: 'Balcony', timezone: 'UTC', hemisphere: 'north', place: null, notes: '' },
    NOW,
  );
  const s = await createSpecimen(
    g.id,
    {
      displayName: '=cmd|calc',
      scientificName: null,
      cultivar: null,
      identityLevel: 'unknown',
      origin: 'gift',
      zoneId: null,
      containerId: null,
      parentSpecimenId: null,
      plantedOn: null,
      status: 'active',
      notes: '',
    },
    NOW,
  );
  const m = await storeImage(
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], { type: 'image/jpeg' }),
    { gardenId: g.id, link: { entity: 'specimen', id: s.id } },
    NOW,
    fakeProcess,
  );
  await logCare(
    {
      gardenId: g.id,
      specimenIds: [s.id],
      kind: 'water',
      amountMl: 750,
      waterSource: 'tap',
      notes: '',
      mediaIds: [m.id],
    },
    NOW,
  );
  return { g, s, m };
}

async function toFile(blob: Blob): Promise<Blob> {
  return new Blob([await blob.arrayBuffer()]);
}

describe('export and import (W12)', () => {
  beforeEach(resetDb);

  it('round-trips records and photos through a verified archive', async () => {
    const { s, m } = await seed();
    const { blob, manifest } = await buildArchive(NOW);
    expect(manifest.counts.specimens).toBe(1);
    expect(manifest.counts.mediaFiles).toBe(1);
    expect(manifest.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);

    await resetDb();
    const preview = await readArchive(await toFile(blob));
    expect(preview.tables.specimens).toMatchObject({ incoming: 1, new: 1, conflicts: 0 });
    const result = await applyImport(preview, 'keep');
    expect(result).toMatchObject({ photos: 1 });
    expect((await db.specimens.get(s.id))?.displayName).toBe('=cmd|calc');
    expect(await db.mediaBlobs.get(m.id)).toBeDefined();
    expect(await db.careEvents.count()).toBe(1);

    const again = await readArchive(await toFile(blob));
    expect(again.tables.specimens).toMatchObject({ new: 0, same: 1 });
  });

  it('reports conflicts and applies the chosen side', async () => {
    const { s } = await seed();
    const { blob } = await buildArchive(NOW);
    await updateSpecimen(s.id, 1, { displayName: 'Renamed here' }, NOW + 1);
    const preview = await readArchive(await toFile(blob));
    expect(preview.tables.specimens.conflicts).toBe(1);
    await applyImport(preview, 'keep');
    expect((await db.specimens.get(s.id))?.displayName).toBe('Renamed here');
    await applyImport(preview, 'replace');
    expect((await db.specimens.get(s.id))?.displayName).toBe('=cmd|calc');
  });

  it('rejects tampered, foreign or newer archives', async () => {
    await seed();
    const { blob } = await buildArchive(NOW);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    files['data/specimens.json'] = strToU8('[]');
    await expect(readArchive(new Blob([zipSync(files)]))).rejects.toMatchObject({ code: 'checksum' });

    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    await expect(
      readArchive(
        new Blob([zipSync({ 'manifest.json': strToU8(JSON.stringify({ ...manifest, formatVersion: 99 })) })]),
      ),
    ).rejects.toMatchObject({ code: 'newer-version' });
    await expect(readArchive(new Blob([zipSync({ 'a.txt': strToU8('x') })]))).rejects.toMatchObject({
      code: 'no-manifest',
    });
    await expect(readArchive(new Blob(['not a zip']))).rejects.toBeInstanceOf(ImportError);
  });

  it('writes formula-safe spreadsheets', async () => {
    await seed();
    const { blob } = await buildCsvExport(NOW);
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const plants = strFromU8(files['plants.csv']!);
    expect(plants).toContain(`'=cmd|calc`);
    expect(strFromU8(files['care-log.csv']!)).toContain(',water,750,tap,');
  });
});
