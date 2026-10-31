import Dexie from 'dexie';
import type { OutboxOp } from '@plantpal/schemas';
import { applyPush, MemorySyncRepo } from '@plantpal/sync';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyImport, buildArchive, readArchive } from '../../src/data/archive';
import {
  addGerminationTest,
  createGarden,
  createSeedLot,
  createSpecimen,
  deleteSeedLot,
  ensureWorkspace,
  updateSpecimen,
} from '../../src/data/commands';
import { createDb, db } from '../../src/data/db';
import { RecordNotFoundError } from '../../src/data/errors';
import { queueClaim } from '../../src/sync/engine';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 30, 6);

async function garden(name = 'Balcony') {
  return createGarden({ name, timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' }, NOW);
}

const plantInput = (displayName: string, over: Record<string, unknown> = {}) => ({
  displayName,
  scientificName: null,
  cultivar: null,
  identityLevel: 'unknown' as const,
  origin: 'nursery' as const,
  zoneId: null,
  containerId: null,
  parentSpecimenId: null,
  plantedOn: null,
  status: 'active' as const,
  notes: '',
  ...over,
});

const lotInput = (gardenId: string, specimenId: string | null, over: Record<string, unknown> = {}) => ({
  gardenId,
  specimenId,
  name: 'Tomato seeds 2026',
  scientificName: null,
  cultivar: null,
  origin: 'saved' as const,
  collectedOn: '2026-09-20',
  quantity: 120,
  unit: 'seeds' as const,
  storage: 'Paper envelope, cool cupboard',
  notes: '',
  ...over,
});

beforeEach(resetDb);

describe('seed lots and lineage (§6.13)', () => {
  it('saves seed from a plant, tests germination, and grows new plants from the lot', async () => {
    const g = await garden();
    const mother = await createSpecimen(
      g.id,
      plantInput('Grandma’s tomato', { scientificName: 'Solanum lycopersicum' }),
      NOW,
    );
    const lot = await createSeedLot(lotInput(g.id, mother.id), NOW + 1);
    // The lot inherits the parent's identity unless told otherwise.
    expect(lot.scientificName).toBe('Solanum lycopersicum');
    const tested = await addGerminationTest(
      lot.id,
      1,
      { testedOn: '2026-10-01', sown: 10, sprouted: 8, days: 7 },
      NOW + 2,
    );
    expect(tested.germinationTests).toHaveLength(1);
    expect(tested.version).toBe(2);
    await expect(
      addGerminationTest(lot.id, 2, { testedOn: '2026-10-01', sown: 5, sprouted: 6, days: null }, NOW + 3),
    ).rejects.toThrow();

    const seedling = await createSpecimen(
      g.id,
      plantInput('Tomato seedling', { origin: 'seed', seedLotId: lot.id }),
      NOW + 4,
    );
    expect(seedling.seedLotId).toBe(lot.id);
    // Existing plants keep working: the new field defaults to null.
    expect(mother.seedLotId).toBeNull();
  });

  it('refuses lots from another garden and deleted lots', async () => {
    const a = await garden('A');
    const b = await garden('B');
    const lot = await createSeedLot(lotInput(a.id, null, { origin: 'bought' }), NOW);
    await expect(
      createSpecimen(b.id, plantInput('Wrong garden', { seedLotId: lot.id }), NOW + 1),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    const p = await createSpecimen(a.id, plantInput('OK'), NOW + 2);
    await deleteSeedLot(lot.id, 1, NOW + 3);
    await expect(updateSpecimen(p.id, 1, { seedLotId: lot.id }, NOW + 4)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });

  it('uploads plants and lots in lineage order when a garden is claimed', async () => {
    const g = await garden();
    const ws = await ensureWorkspace(NOW);
    const mother = await createSpecimen(g.id, plantInput('Mother'), NOW);
    const lot1 = await createSeedLot(lotInput(g.id, mother.id), NOW + 1);
    const child = await createSpecimen(
      g.id,
      plantInput('Child', { origin: 'seed', seedLotId: lot1.id }),
      NOW + 2,
    );
    const lot2 = await createSeedLot(lotInput(g.id, child.id, { name: 'Second generation' }), NOW + 3);
    await createSpecimen(g.id, plantInput('Grandchild', { origin: 'seed', seedLotId: lot2.id }), NOW + 4);
    await queueClaim(ws, NOW + 10);
    const ops = (await db.outbox.toArray()).sort((a, b) => (a.opId < b.opId ? -1 : 1)) as OutboxOp[];
    const repo = new MemorySyncRepo();
    const results = await applyPush(repo, async () => 'owner', 'u', ops, NOW + 20);
    expect(results.map((r) => `${r.status}${r.code ? `:${r.code}` : ''}`)).toEqual(
      Array(ops.length).fill('applied'),
    );
    expect((await repo.liveRecords(ws.id)).filter((r) => r.entity === 'seedLot')).toHaveLength(2);
  });

  it('seed lots travel in the archive', async () => {
    const g = await garden();
    await createSeedLot(lotInput(g.id, null, { origin: 'gift' }), NOW);
    const { blob, manifest } = await buildArchive(NOW + 1);
    expect(manifest.counts.seedLots).toBe(1);
    await resetDb();
    await applyImport(await readArchive(new Blob([await blob.arrayBuffer()])), 'keep');
    expect(await db.seedLots.count()).toBe(1);
  });
});

describe('local database upgrade to schema version 8', () => {
  it('adds seed lots without touching v7 data', async () => {
    const name = 'pp-upgrade-v8';
    await Dexie.delete(name);
    const v7 = new Dexie(name);
    const { STORES_V1 } = await import('../../src/data/db');
    v7.version(1).stores(STORES_V1);
    v7.version(2).stores({ facts: 'key, expiresAt' });
    v7.version(3).stores({
      plans: 'id, gardenId, workspaceId',
      planItems: 'id, planId, gardenId, workspaceId, taxonId',
    });
    v7.version(4).stores({
      careSchedules: 'id, gardenId, specimenId, workspaceId',
      taskLogs: 'id, &opId, gardenId, specimenId, occurrenceKey, at, workspaceId',
    });
    v7.version(5).stores({ speciesDrafts: 'id, workspaceId, scientificName' });
    v7.version(6).stores({
      layouts: 'id, gardenId, zoneId, workspaceId',
      layoutVersions: 'id, layoutId, workspaceId, [layoutId+version]',
    });
    v7.version(7).stores({
      natureVisits: 'id, &opId, gardenId, workspaceId, protocol, startedAt, specimenId',
      pantryItems: 'id, gardenId, workspaceId, harvestId, state',
    });
    await v7.open();
    await v7.table('specimens').put({ id: 's1', gardenId: 'g', workspaceId: 'w', status: 'active' });
    v7.close();
    const v8 = createDb(name);
    await v8.open();
    expect(v8.verno).toBe(8);
    expect(await v8.specimens.count()).toBe(1);
    expect(await v8.seedLots.where('specimenId').equals('s1').count()).toBe(0);
    v8.close();
  });
});
