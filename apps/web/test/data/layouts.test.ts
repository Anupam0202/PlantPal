// @vitest-environment node
import Dexie from 'dexie';
import type { LayoutBody } from '@plantpal/schemas';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyImport, buildArchive, readArchive } from '../../src/data/archive';
import {
  createGarden,
  createLayout,
  createZone,
  deleteLayout,
  ensureWorkspace,
  saveLayout,
} from '../../src/data/commands';
import { createDb, db } from '../../src/data/db';
import { RecordNotFoundError, VersionConflictError } from '../../src/data/errors';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 29, 6, 0);

const body = (items: LayoutBody['items'] = []): LayoutBody => ({
  name: 'Balcony plan',
  frame: { frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: 180 },
  outline: [
    [0, 0],
    [3, 0],
    [3, 1.5],
    [0, 1.5],
  ],
  items,
});

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

const pot = {
  id: 'pot-1',
  kind: 'container' as const,
  shape: 'round' as const,
  x: 0.5,
  y: 0.5,
  x2: 0,
  y2: 0,
  lengthM: 0,
  widthM: 0,
  diameterM: 0.3,
  rotationDeg: 0,
  heightM: null,
  depthM: 0.25,
  volumeL: null,
  solid: false,
  label: 'Basil pot',
  note: '',
  specimenId: null,
  taxonId: null,
  containerId: null,
  inId: null,
};

async function garden() {
  return createGarden(
    { name: 'Balcony', timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' },
    NOW,
  );
}

beforeEach(resetDb);

describe('layouts', () => {
  it('creates a layout with version 1 saved, in a local metric frame', async () => {
    const g = await garden();
    const l = await createLayout(g.id, { zoneId: null, body: body() }, NOW);
    expect(l).toMatchObject({ gardenId: g.id, version: 1, name: 'Balcony plan' });
    expect(l.frame).toEqual({ frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: 180 });
    const versions = await db.layoutVersions.where('layoutId').equals(l.id).toArray();
    expect(versions.map((v) => v.version)).toEqual([1]);
    // Local workspaces queue nothing; synced ones queue create and update.
    expect(await db.outbox.count()).toBe(0);
    const ws = await ensureWorkspace();
    await db.workspaces.put({ ...ws, mode: 'synced' });
    await saveLayout(l.id, 1, body([pot]), '', NOW + 1);
    expect((await db.outbox.toArray()).map((o) => o.type)).toEqual(['layout.update']);
  });

  it('refuses a missing garden or a zone from another garden', async () => {
    const g = await garden();
    const other = await garden();
    const zone = await createZone(other.id, zoneInput, NOW);
    await expect(createLayout('nope', { zoneId: null, body: body() }, NOW)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    await expect(createLayout(g.id, { zoneId: zone.id, body: body() }, NOW)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    const ok = await createLayout(other.id, { zoneId: zone.id, body: body() }, NOW);
    expect(ok.zoneId).toBe(zone.id);
  });

  it('saves versions with optimistic concurrency and keeps each body', async () => {
    const g = await garden();
    const l = await createLayout(g.id, { zoneId: null, body: body() }, NOW);
    const v2 = await saveLayout(l.id, 1, body([pot]), 'Added a pot', NOW + 1);
    expect(v2.version).toBe(2);
    expect(v2.items).toHaveLength(1);
    await expect(saveLayout(l.id, 1, body(), 'stale', NOW + 2)).rejects.toBeInstanceOf(VersionConflictError);
    const versions = (await db.layoutVersions.where('layoutId').equals(l.id).toArray()).sort(
      (a, b) => a.version - b.version,
    );
    expect(versions.map((v) => [v.version, v.note, v.body.items.length])).toEqual([
      [1, '', 0],
      [2, 'Added a pot', 1],
    ]);
  });

  it('rejects invalid bodies instead of storing them', async () => {
    const g = await garden();
    const l = await createLayout(g.id, { zoneId: null, body: body() }, NOW);
    const bad = { ...body([pot]), frame: { frame: 'wgs84', unit: 'deg', origin: [0, 0], rotationDeg: 0 } };
    await expect(saveLayout(l.id, 1, bad as unknown as LayoutBody, '', NOW + 1)).rejects.toThrow();
    expect((await db.layouts.get(l.id))?.version).toBe(1);
  });

  it('soft-deletes', async () => {
    const g = await garden();
    const l = await createLayout(g.id, { zoneId: null, body: body() }, NOW);
    await deleteLayout(l.id, 1, NOW + 5);
    expect((await db.layouts.get(l.id))?.deletedAt).toBe(NOW + 5);
  });

  it('travels in the archive with its versions', async () => {
    const g = await garden();
    const l = await createLayout(g.id, { zoneId: null, body: body([pot]) }, NOW);
    await saveLayout(l.id, 1, body(), 'cleared', NOW + 1);
    const { blob, manifest } = await buildArchive(NOW + 2);
    expect(manifest.counts.layouts).toBe(1);
    expect(manifest.counts.layoutVersions).toBe(2);
    await resetDb();
    const preview = await readArchive(new Blob([await blob.arrayBuffer()]));
    await applyImport(preview, 'keep');
    expect((await db.layouts.get(l.id))?.version).toBe(2);
    expect(await db.layoutVersions.where('layoutId').equals(l.id).count()).toBe(2);
  });
});

describe('Dexie v6 upgrade', () => {
  it('adds layout tables without touching v5 data', async () => {
    const name = 'pp-upgrade-v6';
    await Dexie.delete(name);
    const v5 = new Dexie(name);
    const { STORES_V1 } = await import('../../src/data/db');
    v5.version(1).stores(STORES_V1);
    v5.version(2).stores({ facts: 'key, expiresAt' });
    v5.version(3).stores({
      plans: 'id, gardenId, workspaceId',
      planItems: 'id, planId, gardenId, workspaceId, taxonId',
    });
    v5.version(4).stores({
      careSchedules: 'id, gardenId, specimenId, workspaceId',
      taskLogs: 'id, &opId, gardenId, specimenId, occurrenceKey, at, workspaceId',
    });
    v5.version(5).stores({ speciesDrafts: 'id, workspaceId, scientificName' });
    await v5.open();
    await v5.table('meta').put({ key: 'x', value: 1 });
    await v5.table('speciesDrafts').put({ id: 'd1', workspaceId: 'w', scientificName: 'Ocimum basilicum' });
    v5.close();
    const v6 = createDb(name);
    await v6.open();
    expect(v6.verno).toBeGreaterThanOrEqual(6);
    expect(await v6.table('meta').get('x')).toEqual({ key: 'x', value: 1 });
    expect(await v6.table('speciesDrafts').count()).toBe(1);
    expect(await v6.layouts.count()).toBe(0);
    expect(await v6.layoutVersions.where('[layoutId+version]').equals(['a', 1]).count()).toBe(0);
    v6.close();
  });
});
