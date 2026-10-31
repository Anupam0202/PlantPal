// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSchedules } from '@plantpal/domain';
import {
  createContainer,
  createGarden,
  createSpecimen,
  createZone,
  logTask,
  markPlanted,
  updateSchedule,
  voidTask,
} from '../../src/data/commands';
import { STORES_V1, createDb, db } from '../../src/data/db';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 28, 9, 0);

async function setup() {
  const garden = await createGarden(
    { name: 'Balcony', timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' },
    NOW,
  );
  const zone = await createZone(
    garden.id,
    {
      name: 'Rail',
      kind: 'balcony',
      covered: false,
      areaM2: 2,
      orientationDeg: 270,
      light: 'part-sun',
      wind: null,
      drainage: null,
      notes: '',
    },
    NOW,
  );
  const container = await createContainer(
    zone.id,
    {
      name: 'Pot',
      shape: 'round',
      dimsCm: { diameterCm: 25, depthCm: 22 },
      volumeL: 8,
      material: 'plastic',
      drainageHoles: true,
      substrate: '',
      notes: '',
    },
    NOW,
  );
  const plant = await createSpecimen(
    garden.id,
    {
      displayName: 'Basil',
      scientificName: 'Ocimum basilicum',
      cultivar: null,
      identityLevel: 'species',
      origin: 'nursery',
      zoneId: zone.id,
      containerId: container.id,
      parentSpecimenId: null,
      plantedOn: null,
      status: 'planned',
      notes: '',
      catalogTaxonId: 'ocimum-basilicum',
    },
    NOW,
  );
  return { garden, zone, container, plant };
}

beforeEach(resetDb);

describe('care schedules', () => {
  it('planting a planned plant makes it active and creates its default schedules', async () => {
    const { plant } = await setup();
    const drafts = defaultSchedules(
      {
        specimenId: plant.id,
        useGroup: 'herb',
        foodValue: 'medium',
        plantedOn: '2026-10-28',
        daysToMaturityMin: 60,
      },
      '2026-10-28',
    );
    const next = await markPlanted(plant.id, plant.version, '2026-10-28', drafts, NOW);
    expect(next).toMatchObject({ status: 'active', plantedOn: '2026-10-28' });
    const schedules = await db.careSchedules.where('specimenId').equals(plant.id).toArray();
    expect(schedules.map((s) => s.kind).sort()).toEqual(['feed', 'harvest', 'pest-check']);
    expect(schedules.every((s) => s.origin === 'engine' && s.effectiveFrom === '2026-10-28')).toBe(true);
  });

  it('editing the rule starts a new version from today and marks it as the user’s', async () => {
    const { plant } = await setup();
    await markPlanted(
      plant.id,
      plant.version,
      '2026-10-28',
      [{ kind: 'feed', rule: { freq: 'daily', interval: 14, startOn: '2026-11-11' } }],
      NOW,
    );
    const [s] = await db.careSchedules.toArray();
    const next = await updateSchedule(
      s!.id,
      s!.version,
      { rule: { ...s!.rule, interval: 21 } },
      NOW + 86_400_000,
    );
    expect(next).toMatchObject({ version: 2, origin: 'user', effectiveFrom: '2026-10-29' });
  });
});

describe('task log', () => {
  it('a double tap logs care once (idempotent per occurrence)', async () => {
    const { garden, plant } = await setup();
    const input = {
      gardenId: garden.id,
      occurrenceKey: `water.${plant.id}.2026-10-28`,
      scheduleId: null,
      specimenId: plant.id,
      kind: 'check-water' as const,
      action: 'done' as const,
      dueAt: NOW,
      water: { amountMl: 500, source: 'tap' as const },
    };
    const a = await logTask(input, NOW);
    const b = await logTask(input, NOW + 300);
    expect(b.id).toBe(a.id);
    expect(await db.taskLogs.count()).toBe(1);
    const events = await db.careEvents.toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'water', amountMl: 500, occurrenceKey: input.occurrenceKey });
  });

  it('a soil check teaches the pot: wetter than predicted lowers its water factor', async () => {
    const { garden, plant, container } = await setup();
    await logTask(
      {
        gardenId: garden.id,
        occurrenceKey: `water.${plant.id}.2026-10-28`,
        scheduleId: null,
        specimenId: plant.id,
        kind: 'check-water',
        action: 'checked',
        dueAt: NOW,
        check: { soil: 'moist', leaves: 'fine', pests: false },
        predicted: 'dry',
      },
      NOW,
    );
    expect((await db.containers.get(container.id))?.waterFactor).toBe(0.85);
    // "Checked, still moist" is completed care with no care event (appropriate inaction).
    expect(await db.careEvents.count()).toBe(0);
  });

  it('skips need a reason; snoozes keep their time; undo voids the log and its care event', async () => {
    const { garden, plant } = await setup();
    const base = {
      gardenId: garden.id,
      scheduleId: null,
      specimenId: plant.id,
      kind: 'feed' as const,
      dueAt: NOW,
    };
    const skip = await logTask({ ...base, occurrenceKey: 'k1', action: 'skipped' }, NOW);
    expect(skip.reason).toBe('other');
    const snooze = await logTask(
      { ...base, occurrenceKey: 'k2', action: 'snoozed', snoozeUntil: NOW + 3_600_000 },
      NOW,
    );
    expect(snooze.snoozeUntil).toBe(NOW + 3_600_000);
    const done = await logTask({ ...base, occurrenceKey: 'k3', action: 'done' }, NOW);
    expect(done.careEventId).not.toBeNull();
    await voidTask(done.id, NOW + 1);
    expect((await db.taskLogs.get(done.id))?.deletedAt).toBe(NOW + 1);
    expect((await db.careEvents.get(done.careEventId!))?.deletedAt).toBe(NOW + 1);
  });
});

describe('Dexie upgrade to v4', () => {
  it('opens a v3 database and adds the care tables', async () => {
    const name = 'plantpal-upgrade-v4';
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(1).stores(STORES_V1);
    old.version(2).stores({ facts: 'key, expiresAt' });
    old.version(3).stores({
      plans: 'id, gardenId, workspaceId',
      planItems: 'id, planId, gardenId, workspaceId, taxonId',
    });
    await old.open();
    await old
      .table('containers')
      .add({ id: 'c1', workspaceId: 'w', gardenId: 'g', zoneId: 'z', name: 'Old pot' });
    old.close();
    const upgraded = createDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBeGreaterThanOrEqual(4);
    expect((await upgraded.containers.get('c1'))?.name).toBe('Old pot');
    expect(await upgraded.careSchedules.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
