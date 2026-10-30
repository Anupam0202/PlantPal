// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyImport, buildArchive, readArchive } from '../../src/data/archive';
import {
  addPantryItem,
  createGarden,
  deletePantryItem,
  logHarvest,
  logVisit,
  movePantryItem,
  updatePantryItem,
  voidEntry,
} from '../../src/data/commands';
import { createDb, db } from '../../src/data/db';
import { VersionConflictError } from '../../src/data/errors';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 5, 10, 4, 30);

beforeEach(resetDb);

const garden = () =>
  createGarden(
    { name: 'Balcony', timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' },
    NOW,
  );

const rec = (group: string, count: number | null, state: 'YES' | 'NO' | 'UNCERTAIN' | 'NOT_CHECKED') => ({
  group,
  taxonName: null,
  count,
  state,
  identityConfidence: 'confident' as const,
  behaviour: null,
});

describe('nature visits', () => {
  it('stores all four states exactly, including a zero count and unchecked groups', async () => {
    const g = await garden();
    const v = await logVisit(
      {
        gardenId: g.id,
        protocol: 'fit-count',
        startedAt: NOW - 600_000,
        plannedS: 600,
        durationS: 600,
        targetName: 'Lavender',
        patchFlowerCount: 30,
        weather: { temperatureC: 22, sky: 'sunny', wind: 'light', evidence: 'MODELLED' },
        records: [
          rec('bumblebees', 0, 'NO'),
          rec('honeybees', 2, 'YES'),
          rec('hoverflies', 1, 'UNCERTAIN'),
          rec('wasps', null, 'NOT_CHECKED'),
        ],
      },
      NOW,
    );
    const back = await db.natureVisits.get(v.id);
    expect(back?.records.map((r) => [r.group, r.state, r.count])).toEqual([
      ['bumblebees', 'NO', 0],
      ['honeybees', 'YES', 2],
      ['hoverflies', 'UNCERTAIN', 1],
      ['wasps', 'NOT_CHECKED', null],
    ]);
    expect(back?.occurredOn).toBe('2026-06-10');
    await voidEntry('natureVisits', v.id, NOW + 1);
    expect((await db.natureVisits.get(v.id))?.deletedAt).toBe(NOW + 1);
  });

  it('refuses a malformed visit instead of storing it', async () => {
    const g = await garden();
    await expect(
      logVisit(
        {
          gardenId: g.id,
          protocol: 'fit-count',
          startedAt: NOW,
          plannedS: 600,
          durationS: 600,
          observerCount: 0,
          records: [],
        },
        NOW,
      ),
    ).rejects.toThrow();
    expect(await db.natureVisits.count()).toBe(0);
  });
});

describe('harvest and pantry', () => {
  it('a harvest can go straight to the pantry; states move on and final states stay final', async () => {
    const g = await garden();
    const h = await logHarvest(
      {
        gardenId: g.id,
        specimenId: null,
        plantName: 'Cherry tomatoes',
        massG: 450,
        count: null,
        countLabel: null,
        notes: '',
        toPantry: { bestBefore: '2026-06-14' },
      },
      NOW,
    );
    const [p] = await db.pantryItems.where('harvestId').equals(h.id).toArray();
    expect(p).toMatchObject({
      name: 'Cherry tomatoes',
      state: 'fresh',
      massG: 450,
      bestBefore: '2026-06-14',
    });
    const stored = await movePantryItem(p!.id, 1, 'preserved', NOW + 1);
    expect(stored.history.map((x) => x.state)).toEqual(['fresh', 'preserved']);
    const given = await movePantryItem(p!.id, 2, 'given', NOW + 2);
    await expect(movePantryItem(p!.id, given.version, 'fresh', NOW + 3)).rejects.toThrow(RangeError);
    await expect(movePantryItem(p!.id, 1, 'wasted', NOW + 3)).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('keeps count labels only with counts, and edits and deletes with version checks', async () => {
    const g = await garden();
    const p = await addPantryItem(
      { gardenId: g.id, name: 'Chillies', massG: null, count: null, countLabel: 'pieces', bestBefore: null },
      NOW,
    );
    expect(p.countLabel).toBeNull();
    const e = await updatePantryItem(
      p.id,
      1,
      { count: 12, countLabel: 'pieces', bestBefore: '2026-06-20' },
      NOW + 1,
    );
    expect(e).toMatchObject({ count: 12, countLabel: 'pieces', version: 2 });
    await deletePantryItem(p.id, 2, NOW + 2);
    expect((await db.pantryItems.get(p.id))?.deletedAt).toBe(NOW + 2);
  });

  it('nature visits and the pantry travel in the archive', async () => {
    const g = await garden();
    await logVisit(
      {
        gardenId: g.id,
        protocol: 'sighting',
        startedAt: NOW,
        plannedS: 0,
        durationS: 0,
        records: [rec('bird', 3, 'YES')],
      },
      NOW,
    );
    await addPantryItem(
      { gardenId: g.id, name: 'Basil', massG: 50, count: null, countLabel: null, bestBefore: null },
      NOW,
    );
    const { blob, manifest } = await buildArchive(NOW + 1);
    expect(manifest.counts.natureVisits).toBe(1);
    expect(manifest.counts.pantryItems).toBe(1);
    await resetDb();
    await applyImport(await readArchive(new Blob([await blob.arrayBuffer()])), 'keep');
    expect(await db.natureVisits.count()).toBe(1);
    expect(await db.pantryItems.count()).toBe(1);
  });
});

describe('Dexie v7 upgrade', () => {
  it('adds the nature and pantry tables without touching v6 data', async () => {
    const name = 'pp-upgrade-v7';
    await Dexie.delete(name);
    const v6 = new Dexie(name);
    const { STORES_V1 } = await import('../../src/data/db');
    v6.version(1).stores(STORES_V1);
    v6.version(2).stores({ facts: 'key, expiresAt' });
    v6.version(3).stores({
      plans: 'id, gardenId, workspaceId',
      planItems: 'id, planId, gardenId, workspaceId, taxonId',
    });
    v6.version(4).stores({
      careSchedules: 'id, gardenId, specimenId, workspaceId',
      taskLogs: 'id, &opId, gardenId, specimenId, occurrenceKey, at, workspaceId',
    });
    v6.version(5).stores({ speciesDrafts: 'id, workspaceId, scientificName' });
    v6.version(6).stores({
      layouts: 'id, gardenId, zoneId, workspaceId',
      layoutVersions: 'id, layoutId, workspaceId, [layoutId+version]',
    });
    await v6.open();
    await v6.table('layouts').put({ id: 'l1', gardenId: 'g', zoneId: null, workspaceId: 'w' });
    v6.close();
    const v7 = createDb(name);
    await v7.open();
    expect(v7.verno).toBeGreaterThanOrEqual(7);
    expect(await v7.table('layouts').count()).toBe(1);
    expect(await v7.natureVisits.count()).toBe(0);
    expect(await v7.pantryItems.where('state').equals('fresh').count()).toBe(0);
    v7.close();
  });
});
