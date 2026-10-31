// @vitest-environment node
// Data-layer tests run in Node so IndexedDB stores real Blobs (happy-dom Blobs are not cloneable).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createContainer,
  createGarden,
  createSpecimen,
  createZone,
  deleteZone,
  ensureWorkspace,
  logCare,
  logHarvest,
  addObservation,
  restoreEntry,
  setSpecimenStatus,
  updateSpecimen,
  voidEntry,
  type SpecimenInput,
} from '../../src/data/commands';
import { CLIENT_SCHEMA, db } from '../../src/data/db';
import { RecordNotFoundError, VersionConflictError } from '../../src/data/errors';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 27, 9, 0);

const gardenInput = {
  name: 'Balcony',
  timezone: 'Asia/Kolkata',
  hemisphere: 'north' as const,
  place: null,
  notes: '',
};
const zoneInput = {
  name: 'Railing',
  kind: 'balcony' as const,
  covered: false,
  areaM2: 2.5,
  orientationDeg: 180,
  light: 'full-sun' as const,
  wind: 'moderate' as const,
  drainage: 'normal' as const,
  notes: '',
};
const plant = (over: Partial<SpecimenInput> = {}): SpecimenInput => ({
  displayName: 'Tomato',
  scientificName: 'Solanum lycopersicum',
  cultivar: null,
  identityLevel: 'species',
  origin: 'nursery',
  zoneId: null,
  containerId: null,
  parentSpecimenId: null,
  plantedOn: '2026-10-01',
  status: 'active',
  notes: '',
  ...over,
});

describe('local garden commands', () => {
  beforeEach(resetDb);

  it('creates a local workspace once and remembers the active garden', async () => {
    const [a, b] = await Promise.all([ensureWorkspace(NOW), ensureWorkspace(NOW)]);
    expect(a.id).toBe(b.id);
    expect(await db.workspaces.count()).toBe(1);
    const g = await createGarden(gardenInput, NOW);
    expect((await db.meta.get('activeGardenId'))?.value).toBe(g.id);
  });

  it('computes container volume and checks placement belongs to the same garden', async () => {
    const g1 = await createGarden(gardenInput, NOW);
    const g2 = await createGarden({ ...gardenInput, name: 'Terrace' }, NOW);
    const z1 = await createZone(g1.id, zoneInput, NOW);
    const z2 = await createZone(g2.id, zoneInput, NOW);
    const pot = await createContainer(
      z1.id,
      {
        name: 'Big pot',
        shape: 'round',
        dimsCm: { diameterCm: 30, depthCm: 25 },
        volumeL: null,
        material: 'terracotta',
        drainageHoles: true,
        substrate: '',
        notes: '',
      },
      NOW,
    );
    expect(pot.volumeL).toBe(17.7);
    await expect(createSpecimen(g1.id, plant({ zoneId: z2.id }), NOW)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(
      createSpecimen(g1.id, plant({ zoneId: z1.id, containerId: pot.id }), NOW),
    ).resolves.toMatchObject({ zoneId: z1.id });
    await expect(createSpecimen(g2.id, plant({ containerId: pot.id }), NOW)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });

  it('rejects stale updates with a version conflict', async () => {
    const g = await createGarden(gardenInput, NOW);
    const s = await createSpecimen(g.id, plant(), NOW);
    const s2 = await updateSpecimen(s.id, 1, { displayName: 'Cherry tomato' }, NOW + 1);
    expect(s2.version).toBe(2);
    await expect(updateSpecimen(s.id, 1, { displayName: 'Other' }, NOW + 2)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    await expect(updateSpecimen(s.id, 2, { parentSpecimenId: s.id }, NOW + 2)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });

  it('logs one append-only care event per plant and never invents amounts', async () => {
    const g = await createGarden(gardenInput, NOW);
    const a = await createSpecimen(g.id, plant(), NOW);
    const b = await createSpecimen(g.id, plant({ displayName: 'Basil' }), NOW);
    const evs = await logCare(
      {
        gardenId: g.id,
        specimenIds: [a.id, b.id],
        kind: 'water',
        amountMl: 500,
        waterSource: 'tap',
        notes: '',
      },
      NOW,
    );
    expect(evs).toHaveLength(2);
    expect(evs[0]?.occurredOn).toBe('2026-10-27');
    const feed = await logCare(
      { gardenId: g.id, specimenIds: [a.id], kind: 'feed', amountMl: 500, waterSource: 'tap', notes: '' },
      NOW,
    );
    expect(feed[0]).toMatchObject({ amountMl: null, waterSource: null });
    const past = await logCare(
      {
        gardenId: g.id,
        specimenIds: [a.id],
        kind: 'water',
        amountMl: null,
        waterSource: null,
        notes: '',
        occurredOn: '2026-10-25',
      },
      NOW,
    );
    expect(past[0]).toMatchObject({ occurredOn: '2026-10-25', amountMl: null });
  });

  it('voids and restores entries (undo) without deleting them', async () => {
    const g = await createGarden(gardenInput, NOW);
    const s = await createSpecimen(g.id, plant(), NOW);
    const ob = await addObservation(
      {
        gardenId: g.id,
        specimenId: s.id,
        kind: 'milestone',
        milestone: 'first-flower',
        title: 'First flower',
        notes: '',
      },
      NOW,
    );
    await voidEntry('observations', ob.id, NOW + 5);
    expect((await db.observations.get(ob.id))?.deletedAt).toBe(NOW + 5);
    await restoreEntry('observations', ob.id);
    expect((await db.observations.get(ob.id))?.deletedAt).toBeNull();
  });

  it('keeps harvest mass and counts separate', async () => {
    const g = await createGarden(gardenInput, NOW);
    const h = await logHarvest(
      {
        gardenId: g.id,
        specimenId: null,
        plantName: 'Basil',
        massG: null,
        count: 3,
        countLabel: 'bunch',
        notes: '',
      },
      NOW,
    );
    expect(h).toMatchObject({ massG: null, count: 3, countLabel: 'bunch', harvestedOn: '2026-10-27' });
  });

  it('deleting a zone keeps its plants (without a zone) and removes its containers', async () => {
    const g = await createGarden(gardenInput, NOW);
    const z = await createZone(g.id, zoneInput, NOW);
    const c = await createContainer(
      z.id,
      {
        name: 'Pot',
        shape: 'square',
        dimsCm: { lengthCm: 20, depthCm: 20 },
        volumeL: null,
        material: null,
        drainageHoles: null,
        substrate: '',
        notes: '',
      },
      NOW,
    );
    const s = await createSpecimen(g.id, plant({ zoneId: z.id, containerId: c.id }), NOW);
    await deleteZone(z.id, 1, NOW + 1);
    expect(await db.specimens.get(s.id)).toMatchObject({
      zoneId: null,
      containerId: null,
      version: 2,
      deletedAt: null,
    });
    expect((await db.containers.get(c.id))?.deletedAt).toBe(NOW + 1);
  });

  it('archiving a plant never blocks adding the same plant again, and counts stay honest', async () => {
    const g = await createGarden(gardenInput, NOW);
    const first = await createSpecimen(g.id, plant(), NOW);
    await setSpecimenStatus(first.id, 1, 'archived', 'Finished for the season', NOW + 1);
    const again = await createSpecimen(g.id, plant(), NOW + 2);
    expect(again.id).not.toBe(first.id);
    const all = await db.specimens.where('gardenId').equals(g.id).toArray();
    expect(all.filter((s) => s.status === 'active')).toHaveLength(1);
    expect(all.filter((s) => s.status === 'archived')).toHaveLength(1);
  });

  it('queues nothing for local workspaces and every change for synced ones', async () => {
    const g = await createGarden(gardenInput, NOW);
    await createSpecimen(g.id, plant(), NOW);
    expect(await db.outbox.count()).toBe(0);
    const ws = await ensureWorkspace();
    await db.workspaces.put({ ...ws, mode: 'synced' });
    const s = await createSpecimen(g.id, plant({ displayName: 'Mint' }), NOW + 1);
    const [ev] = await logCare(
      { gardenId: g.id, specimenIds: [s.id], kind: 'water', amountMl: 250, waterSource: 'rain', notes: '' },
      NOW + 2,
    );
    const ops = await db.outbox.orderBy('createdAt').toArray();
    expect(ops.map((o) => o.type)).toEqual(['specimen.create', 'careEvent.create']);
    expect(ops[1]?.opId).toBe(ev?.opId);
    expect(ops.every((o) => o.state === 'pending' && o.clientSchema === CLIENT_SCHEMA)).toBe(true);
  });
});
