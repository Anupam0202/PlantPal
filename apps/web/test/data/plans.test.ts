// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { saveSeedPlan, savePlan, type PlanItemInput } from '../../src/data/commands';
import { STORES_V1, createDb, db } from '../../src/data/db';
import { RecordNotFoundError } from '../../src/data/errors';
import { resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 28, 9, 0);

const garden = {
  name: 'Balcony',
  timezone: 'Asia/Kolkata',
  hemisphere: 'north' as const,
  place: { label: 'Pune', lat: 18.52, lon: 73.86 },
  notes: '',
  region: { countryCode: 'IN', admin1: 'Maharashtra', l3: null },
  profile: {
    household: { cats: true, dogs: false, children: false },
    showToxicWithWarning: false,
    goals: ['food' as const],
    minutesPerWeek: 60,
    waterAccess: 'tap' as const,
    budget: null,
    manualClimate: null,
  },
};
const zone = {
  name: 'West balcony',
  kind: 'balcony' as const,
  covered: false,
  areaM2: 3,
  orientationDeg: 270,
  light: 'part-sun' as const,
  wind: null,
  drainage: null,
  notes: '',
  sun: {
    method: 'facing' as const,
    facingDeg: 270,
    overhangDeg: null,
    across: 'low' as const,
    horizon: null,
    quick: null,
    monthlyHours: [4.4, 4.7, 5, 5.2, 5.4, 5.4, 5.3, 5.2, 4.9, 4.7, 4.4, 4.3],
    year: 2026,
    computedAt: NOW,
  },
};
const meta = { name: 'First plan', catalogVersion: '2026.10.0', engineVersion: 'm4', inputsHash: 'abc' };
const item = (over: Partial<PlanItemInput>): PlanItemInput => ({
  taxonId: 'mentha-spicata',
  status: 'ELIGIBLE',
  chosen: true,
  score: 80,
  findings: [],
  flags: ['NEEDS_REVIEW'],
  zone: 0,
  displayName: 'Spearmint',
  scientificName: 'Mentha spicata',
  ...over,
});

beforeEach(resetDb);

describe('saveSeedPlan', () => {
  it('creates the garden, zones, plan snapshot and planned specimens together', async () => {
    const r = await saveSeedPlan(
      {
        garden,
        zones: [zone],
        plan: meta,
        items: [
          item({}),
          item({
            taxonId: 'lantana-camara',
            status: 'EXCLUDED',
            chosen: false,
            score: null,
            findings: [{ rule: 'E1', outcome: 'exclude', code: 'invasiveListed', sourceId: 'griis-in' }],
            displayName: 'Lantana',
            scientificName: 'Lantana camara',
          }),
        ],
      },
      NOW,
    );
    expect(r.garden.region?.countryCode).toBe('IN');
    expect(r.zones[0]?.sun?.monthlyHours[0]).toBe(4.4);
    expect(r.specimens).toHaveLength(1);
    expect(r.specimens[0]).toMatchObject({
      status: 'planned',
      catalogTaxonId: 'mentha-spicata',
      zoneId: r.zones[0]?.id,
    });
    const items = await db.planItems.where('planId').equals(r.plan.id).toArray();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.taxonId === 'lantana-camara')).toMatchObject({
      chosen: false,
      specimenId: null,
    });
    expect((await db.meta.get('activeGardenId'))?.value).toBe(r.garden.id);
  });

  it('writes nothing if a chosen plant is not eligible', async () => {
    await expect(
      saveSeedPlan({ garden, zones: [zone], plan: meta, items: [item({ status: 'EXCLUDED' })] }, NOW),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    expect(await db.gardens.count()).toBe(0);
    expect(await db.zones.count()).toBe(0);
    expect(await db.plans.count()).toBe(0);
    expect(await db.specimens.count()).toBe(0);
  });

  it('keeps light 0 as 0', async () => {
    const dark = { ...zone, sun: { ...zone.sun, monthlyHours: new Array(12).fill(0) } };
    const r = await saveSeedPlan({ garden, zones: [dark], plan: meta, items: [] }, NOW);
    expect((await db.zones.get(r.zones[0]!.id))?.sun?.monthlyHours).toEqual(new Array(12).fill(0));
  });
});

describe('savePlan', () => {
  it('refuses zones from another garden', async () => {
    const a = await saveSeedPlan({ garden, zones: [zone], plan: meta, items: [] }, NOW);
    const b = await saveSeedPlan(
      { garden: { ...garden, name: 'Other' }, zones: [], plan: meta, items: [] },
      NOW,
    );
    await expect(savePlan(b.garden.id, meta, [item({ zone: a.zones[0]!.id })], NOW)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });
});

describe('local database upgrade to schema version 3', () => {
  it('opens a v2 database, keeps old rows and adds the plan tables', async () => {
    const name = 'plantpal-upgrade-test';
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(1).stores(STORES_V1);
    old.version(2).stores({ facts: 'key, expiresAt' });
    await old.open();
    await old.table('gardens').add({ id: 'g1', workspaceId: 'w1', name: 'Old garden' });
    old.close();

    const upgraded = createDb(name);
    await upgraded.open();
    expect(upgraded.verno).toBeGreaterThanOrEqual(3);
    expect((await upgraded.gardens.get('g1'))?.name).toBe('Old garden');
    expect(await upgraded.plans.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
