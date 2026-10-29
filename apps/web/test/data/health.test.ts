// @vitest-environment node
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { rulesTriage } from '@plantpal/domain';
import {
  addCaseEntry,
  closeHealthCase,
  createGarden,
  createSpecimen,
  deleteSpeciesDraft,
  openHealthCase,
  reviewDraftTrait,
  saveSpeciesDraft,
  storeImage,
} from '../../src/data/commands';
import { createDb, db } from '../../src/data/db';
import { fakeProcess, resetDb } from './helpers';

const NOW = Date.UTC(2026, 9, 29, 6, 0);

beforeEach(resetDb);

async function setup() {
  const garden = await createGarden(
    { name: 'Balcony', timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' },
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
      zoneId: null,
      containerId: null,
      parentSpecimenId: null,
      plantedOn: '2026-10-01',
      status: 'active',
      notes: '',
    },
    NOW,
  );
  return { garden, plant };
}

describe('health cases', () => {
  it('opens a case with photos, answers and rule triage, and schedules +3 and +7 day checks', async () => {
    const { garden, plant } = await setup();
    const photo = await storeImage(
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 1])]),
      { gardenId: garden.id, link: null },
      NOW,
      fakeProcess,
    );
    const q = {
      onset: 'gradual' as const,
      signs: ['wilting' as const],
      where: null,
      spread: 'one-plant' as const,
      changes: [],
      soil: 'dry' as const,
      notes: '',
    };
    const triage = rulesTriage(q, {
      sunHours: 4,
      container: true,
      maxTempC: 30,
      minTempC: 20,
      wateringsLast14: 2,
      covered: true,
    });
    const hc = await openHealthCase(
      {
        gardenId: garden.id,
        specimenId: plant.id,
        title: 'Basil',
        entries: [
          { kind: 'photo', by: 'user', mediaIds: [photo.id] },
          { kind: 'questionnaire', by: 'user', payload: q },
          { kind: 'triage', by: 'rules', payload: triage },
        ],
        followUpDays: triage.followUpDays,
      },
      NOW,
    );
    expect(hc.status).toBe('open');
    expect(hc.entries.map((e) => [e.kind, e.by, e.evidence])).toEqual([
      ['photo', 'user', 'UNKNOWN'],
      ['questionnaire', 'user', 'UNKNOWN'],
      ['triage', 'rules', 'MODELLED'],
    ]);
    const schedules = await db.careSchedules.bulkGet(hc.followUpScheduleIds);
    expect(schedules.map((s) => s?.rule.startOn)).toEqual(['2026-11-01', '2026-11-05']);
    expect(schedules.every((s) => s?.rule.until === s?.rule.startOn && s?.kind === 'custom')).toBe(true);
    expect((await db.media.get(photo.id))?.link).toEqual({ entity: 'healthCase', id: hc.id });
  });

  it('AI triage is appended as a draft; a follow-up moves it to monitoring; closing removes pending checks', async () => {
    const { garden, plant } = await setup();
    let hc = await openHealthCase(
      { gardenId: garden.id, specimenId: plant.id, title: 'Basil', entries: [], followUpDays: [3, 7] },
      NOW,
    );
    hc = await addCaseEntry(
      hc.id,
      hc.version,
      { kind: 'triage', by: 'ai', payload: { candidates: [] } },
      NOW + 1000,
    );
    expect(hc.entries.at(-1)?.evidence).toBe('AI_DRAFT');
    hc = await addCaseEntry(
      hc.id,
      hc.version,
      { kind: 'followup', by: 'user', text: 'Perked up', payload: { trend: 'better' } },
      NOW + 2000,
    );
    expect(hc.status).toBe('monitoring');
    hc = await closeHealthCase(hc.id, hc.version, 'resolved', 'Recovered after watering', NOW + 3000);
    expect(hc).toMatchObject({ status: 'closed', outcome: 'resolved' });
    expect(hc.entries.at(-1)).toMatchObject({ kind: 'outcome', payload: { outcome: 'resolved' } });
    const schedules = await db.careSchedules.bulkGet(hc.followUpScheduleIds);
    expect(schedules.every((s) => s?.deletedAt !== null)).toBe(true);
    await expect(addCaseEntry(hc.id, 1, { kind: 'note', by: 'user' })).rejects.toThrow();
  });

  it('legacy health cases (v3 scans) still parse with the new optional fields', async () => {
    const legacy = {
      id: '01JB0000000000000000000000',
      workspaceId: '01JB0000000000000000000001',
      createdAt: NOW,
      updatedAt: NOW,
      version: 1,
      deletedAt: null,
      gardenId: '01JB0000000000000000000002',
      specimenId: null,
      title: 'Basil — photo check',
      status: 'closed',
      openedAt: NOW,
      closedAt: NOW,
      outcome: 'unknown',
      entries: [
        { id: '01JB0000000000000000000003', kind: 'triage', at: NOW, evidence: 'AI_DRAFT', payload: {} },
      ],
      source: null,
    };
    const { HealthCase } = await import('@plantpal/schemas');
    const parsed = HealthCase.parse(legacy);
    expect(parsed.followUpScheduleIds).toEqual([]);
    expect(parsed.entries[0]).toMatchObject({ by: 'user', mediaIds: [], text: '' });
  });
});

describe('species drafts (F3 curator queue)', () => {
  const traits = [
    {
      trait: 'minTempC',
      value: 0,
      unit: '°C',
      appliesTo: null,
      citations: [{ url: 'https://example.org/a', title: 'A' }],
    },
    {
      trait: 'toxicity',
      value: 'Not documented for pets',
      unit: null,
      appliesTo: null,
      citations: [{ url: 'https://example.org/b', title: 'B' }],
    },
  ];
  const input = {
    scientificName: 'Salvia hispanica',
    gbifKey: 2927324,
    family: 'Lamiaceae',
    commonName: 'Chia',
    traits: traits as never,
    cannotDetermine: [],
    model: 'gemini-3.5-flash',
    promptVersion: 1,
  };

  it('stores every trait as AI_DRAFT; a curator can accept or reject, but never accept toxicity', async () => {
    let d = await saveSpeciesDraft(input, NOW);
    expect(d.traits.map((t) => t.review)).toEqual(['AI_DRAFT', 'AI_DRAFT']);
    d = await reviewDraftTrait(d.id, d.version, 0, 'accepted', NOW + 1);
    expect(d.traits[0]?.review).toBe('accepted');
    await expect(reviewDraftTrait(d.id, d.version, 1, 'accepted')).rejects.toThrow(/cannot be accepted/);
    d = await reviewDraftTrait(d.id, d.version, 1, 'rejected', NOW + 2);
    expect(d.traits[1]?.review).toBe('rejected');
    await deleteSpeciesDraft(d.id, d.version, NOW + 3);
    expect((await db.speciesDrafts.get(d.id))?.deletedAt).toBe(NOW + 3);
  });
});

describe('Dexie v5 upgrade', () => {
  it('adds the species drafts table without touching v4 data', async () => {
    const name = 'pp-upgrade-v5';
    await Dexie.delete(name);
    const v4 = new Dexie(name);
    const { STORES_V1 } = await import('../../src/data/db');
    v4.version(1).stores(STORES_V1);
    v4.version(2).stores({ facts: 'key, expiresAt' });
    v4.version(3).stores({
      plans: 'id, gardenId, workspaceId',
      planItems: 'id, planId, gardenId, workspaceId, taxonId',
    });
    v4.version(4).stores({
      careSchedules: 'id, gardenId, specimenId, workspaceId',
      taskLogs: 'id, &opId, gardenId, specimenId, occurrenceKey, at, workspaceId',
    });
    await v4.open();
    await v4.table('meta').put({ key: 'x', value: 1 });
    v4.close();
    const v5 = createDb(name);
    await v5.open();
    expect(v5.verno).toBe(5);
    expect(await v5.table('meta').get('x')).toEqual({ key: 'x', value: 1 });
    expect(await v5.speciesDrafts.count()).toBe(0);
    v5.close();
  });
});
