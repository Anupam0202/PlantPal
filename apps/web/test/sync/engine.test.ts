// @vitest-environment node
import { newId } from '@plantpal/domain';
import type { OutboxOp } from '@plantpal/schemas';
import { applyOp, applyPush, MemorySyncRepo, pullChanges, snapshot, type Role } from '@plantpal/sync';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createContainer,
  createGarden,
  createSpecimen,
  createZone,
  ensureWorkspace,
  logCare,
  logTask,
  updateZone,
} from '../../src/data/commands';
import { db, getMeta } from '../../src/data/db';
import {
  applySnapshot,
  conflicts,
  discardUnsent,
  joinWorkspace,
  keepMine,
  keepTheirs,
  pullOnce,
  pushOnce,
  queueClaim,
  resumeAfterReview,
  retryUnsent,
  reviewKey,
  type Transport,
} from '../../src/sync/engine';
import { resetDb } from '../data/helpers';

const NOW = Date.UTC(2026, 9, 30, 6, 0);
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The real server logic behind a JSON boundary, as over HTTP. */
function server() {
  const repo = new MemorySyncRepo();
  const roles = new Map<string, Role>();
  let clock = NOW + 1000;
  const t = (user: string): Transport => ({
    push: async (ops) =>
      json({ results: await applyPush(repo, async () => roles.get(user) ?? null, user, json(ops), clock++) }),
    pull: async (ws, cursor, limit) =>
      json(await pullChanges(repo, roles.get(user) ?? null, ws, cursor, limit)),
    snapshot: async (ws) => json(await snapshot(repo, roles.get(user) ?? null, ws)),
  });
  /** Another person's device writing straight to the server. */
  const other = async (op: Omit<OutboxOp, 'opId' | 'createdAt' | 'clientSchema' | 'state'>) =>
    applyOp(
      repo,
      { id: 'u-partner', role: 'gardener' },
      { ...op, opId: newId(clock), createdAt: clock, clientSchema: 7, state: 'pending' },
      clock++,
    );
  return { repo, roles, t, other };
}

async function guestGarden() {
  const ws = await ensureWorkspace(NOW);
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
  const pot = await createContainer(
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
  const plant = (name: string, parentSpecimenId: string | null = null) =>
    createSpecimen(
      garden.id,
      {
        displayName: name,
        scientificName: null,
        cultivar: null,
        identityLevel: 'unknown',
        origin: parentSpecimenId ? 'cutting' : 'nursery',
        zoneId: zone.id,
        containerId: pot.id,
        parentSpecimenId,
        plantedOn: null,
        status: 'active',
        notes: '',
      },
      NOW,
    );
  const basil = await plant('Basil');
  // Edited a few times as a guest: versions restart at 1 when the garden is claimed.
  let z = await updateZone(zone.id, 1, { name: 'Railing' }, NOW + 1);
  z = await updateZone(zone.id, z.version, { name: 'South railing' }, NOW + 2);
  return { ws, garden, zone: z, basil, plant };
}

const drain = async (t: Transport) => {
  for (let i = 0; i < 20; i++) if ((await pushOnce(t)).sent === 0) return;
  throw new Error('outbox never drained');
};
const pending = () => db.outbox.where('state').equals('pending').count();
const careInput = (gardenId: string, specimenId: string) => ({
  gardenId,
  specimenIds: [specimenId],
  kind: 'water' as const,
  amountMl: 300,
  waterSource: 'tap' as const,
  notes: '',
});

beforeEach(resetDb);

describe('sync engine: claiming a guest garden', () => {
  it('uploads everything through the validated push path, references first', async () => {
    const { ws, garden, zone, basil, plant } = await guestGarden();
    // A cutting made later points at its parent.
    const cutting = await plant('Basil cutting', basil.id);
    await logCare(careInput(garden.id, basil.id), NOW + 3);
    expect(await pending()).toBe(0); // guest workspaces queue nothing

    const s = server();
    s.roles.set('me', 'owner');
    await queueClaim(ws, NOW + 10);
    expect((await db.workspaces.get(ws.id))?.mode).toBe('synced');
    expect((await db.zones.get(zone.id))?.version).toBe(1);
    await drain(s.t('me'));

    expect(await db.outbox.count()).toBe(0);
    const live = await s.repo.liveRecords(ws.id);
    expect(live.map((r) => r.entity).sort()).toEqual(
      ['careEvent', 'container', 'garden', 'specimen', 'specimen', 'zone'].sort(),
    );
    expect((await s.repo.getRecord('zone', zone.id))?.record.name).toBe('South railing');
    expect((await s.repo.getRecord('specimen', cutting.id))?.record.parentSpecimenId).toBe(basil.id);

    // From now on, ordinary edits queue and go up as normal changes.
    await updateZone(zone.id, 1, { name: 'Rail again' }, NOW + 20);
    expect(await pending()).toBe(1);
    await drain(s.t('me'));
    expect((await s.repo.getRecord('zone', zone.id))?.version).toBe(2);
  });
});

async function claimed() {
  const g = await guestGarden();
  const s = server();
  s.roles.set('me', 'owner');
  await queueClaim(g.ws, NOW + 10);
  await drain(s.t('me'));
  await pullOnce(s.t('me'), g.ws.id);
  return { ...g, s };
}

describe('sync engine: pull', () => {
  it('brings in other people’s changes and keeps my unsent ones', async () => {
    const { ws, zone, basil, garden, s } = await claimed();
    const theirs = { ...(await db.zones.get(zone.id))!, name: 'Shady rail', version: 2, updatedAt: NOW + 50 };
    expect(
      (
        await s.other({
          workspaceId: ws.id,
          type: 'zone.update',
          entityId: zone.id,
          payload: theirs,
          baseVersion: 1,
        })
      ).status,
    ).toBe('applied');
    const care = {
      id: newId(NOW),
      opId: newId(NOW),
      workspaceId: ws.id,
      gardenId: garden.id,
      createdAt: NOW + 55,
      deletedAt: null,
      occurredAt: NOW + 55,
      occurredOn: '2026-10-30',
      dateUncertain: false,
      specimenId: basil.id,
      kind: 'water',
      amountMl: 250,
      waterSource: 'rain',
      occurrenceKey: null,
      notes: '',
      mediaIds: [],
      source: null,
    };
    const added = await s.other({
      workspaceId: ws.id,
      type: 'careEvent.create',
      entityId: care.id,
      payload: care,
      baseVersion: null,
    });
    expect(added.status).toBe('applied');
    const r = await pullOnce(s.t('me'), ws.id);
    expect(r.changes).toBe(2);
    expect((await db.zones.get(zone.id))?.name).toBe('Shady rail');
    expect(await db.careEvents.get(care.id)).toBeDefined();

    // A pull while I have an unsent edit leaves my edit alone.
    await updateZone(zone.id, 2, { name: 'My name' }, NOW + 60);
    const again = { ...theirs, name: 'Their newer name', version: 3 };
    await s.other({
      workspaceId: ws.id,
      type: 'zone.update',
      entityId: zone.id,
      payload: again,
      baseVersion: 2,
    });
    await pullOnce(s.t('me'), ws.id);
    expect((await db.zones.get(zone.id))?.name).toBe('My name');
  });

  it('falls back to a snapshot when away too long, and pauses my waiting changes for review', async () => {
    const { ws, zone, garden, basil, s } = await claimed();
    await logCare(careInput(garden.id, basil.id), NOW + 100);
    const theirs = { ...(await db.zones.get(zone.id))!, name: 'Renamed', version: 2, updatedAt: NOW + 100 };
    await s.other({
      workspaceId: ws.id,
      type: 'zone.update',
      entityId: zone.id,
      payload: theirs,
      baseVersion: 1,
    });
    s.repo.prune(ws.id, Number.MAX_SAFE_INTEGER);

    const r = await pullOnce(s.t('me'), ws.id);
    expect(r.snapshot).toBe(true);
    expect((await db.zones.get(zone.id))?.name).toBe('Renamed');
    expect(await getMeta(reviewKey(ws.id))).toBe(true);
    expect((await pushOnce(s.t('me'))).sent).toBe(0);

    await resumeAfterReview(ws.id);
    expect((await pushOnce(s.t('me'))).applied).toBe(1);
  });
});

describe('sync engine: conflicts, duplicates and refusals', () => {
  it('keeps the server copy on a conflict, and lets me re-apply mine', async () => {
    const { ws, zone, s } = await claimed();
    const theirs = { ...(await db.zones.get(zone.id))!, name: 'Theirs', version: 2, updatedAt: NOW + 50 };
    await s.other({
      workspaceId: ws.id,
      type: 'zone.update',
      entityId: zone.id,
      payload: theirs,
      baseVersion: 1,
    });
    await updateZone(zone.id, 1, { name: 'Mine' }, NOW + 60);
    await updateZone(zone.id, 2, { name: 'Mine, edited again' }, NOW + 61);

    const r = await pushOnce(s.t('me'));
    expect(r.conflicts).toBe(1);
    expect(await pending()).toBe(0); // the second edit was folded into the conflict
    expect((await db.zones.get(zone.id))?.name).toBe('Theirs');
    const [c] = await conflicts();
    expect(c).toMatchObject({ entity: 'zone', entityId: zone.id, action: 'update' });
    expect(c!.mine?.name).toBe('Mine, edited again');

    await keepMine(c!.id, NOW + 70);
    expect(await conflicts()).toEqual([]);
    await drain(s.t('me'));
    expect((await s.repo.getRecord('zone', zone.id))?.record.name).toBe('Mine, edited again');
    expect((await db.zones.get(zone.id))?.version).toBe(3);
  });

  it('keeping theirs just closes the conflict', async () => {
    const { ws, zone, s } = await claimed();
    const theirs = { ...(await db.zones.get(zone.id))!, name: 'Theirs', version: 2, updatedAt: NOW + 50 };
    await s.other({
      workspaceId: ws.id,
      type: 'zone.update',
      entityId: zone.id,
      payload: theirs,
      baseVersion: 1,
    });
    await updateZone(zone.id, 1, { name: 'Mine' }, NOW + 60);
    await pushOnce(s.t('me'));
    await keepTheirs((await conflicts())[0]!.id);
    expect(await conflicts()).toEqual([]);
    expect(await pending()).toBe(0);
    expect((await db.zones.get(zone.id))?.name).toBe('Theirs');
  });

  it('when someone finished the same task first, my completion gives way to theirs', async () => {
    const { ws, garden, basil, s } = await claimed();
    const key = `water.${basil.id}.2026-10-30`;
    const input = {
      gardenId: garden.id,
      occurrenceKey: key,
      scheduleId: null,
      specimenId: basil.id,
      kind: 'water' as const,
      action: 'done' as const,
      dueAt: NOW,
    };
    // The partner's completion reaches the server first.
    const mine = await logTask(input, NOW + 100);
    const myOps = await db.outbox.where('state').equals('pending').sortBy('opId');
    const [careOp, logOp] = myOps;
    const partnerCare = newId(NOW + 101);
    const partnerLog = newId(NOW + 101);
    await s.other({
      workspaceId: ws.id,
      type: 'careEvent.create',
      entityId: partnerCare,
      payload: { ...(careOp!.payload as object), id: partnerCare, opId: newId(NOW + 101) },
      baseVersion: null,
    });
    await s.other({
      workspaceId: ws.id,
      type: 'taskLog.create',
      entityId: partnerLog,
      payload: {
        ...(logOp!.payload as object),
        id: partnerLog,
        opId: newId(NOW + 101),
        careEventId: partnerCare,
      },
      baseVersion: null,
    });

    const r = await pushOnce(s.t('me'));
    expect(r.applied).toBe(2);
    expect(await db.taskLogs.get(mine.id)).toBeUndefined();
    await pullOnce(s.t('me'), ws.id);
    expect(await db.taskLogs.get(partnerLog)).toBeDefined();
    expect((await db.taskLogs.where('occurrenceKey').equals(key).toArray()).length).toBe(1);
  });

  it('keeps refused changes on this device to retry or discard, never resending them alone', async () => {
    const { garden, basil, s } = await claimed();
    s.roles.set('me', 'viewer');
    await logCare(careInput(garden.id, basil.id), NOW + 100);
    const r = await pushOnce(s.t('me'));
    expect(r.rejected).toBe(1);
    const [op] = await db.outbox.toArray();
    expect(op).toMatchObject({ state: 'rejected', error: { code: 'FORBIDDEN' } });
    expect((await pushOnce(s.t('me'))).sent).toBe(0);

    s.roles.set('me', 'helper');
    await retryUnsent([op!.opId]);
    expect((await pushOnce(s.t('me'))).applied).toBe(1);

    s.roles.set('me', 'viewer');
    await logCare(careInput(garden.id, basil.id), NOW + 200);
    await pushOnce(s.t('me'));
    const refused = await db.outbox.toArray();
    await discardUnsent(refused.map((o) => o.opId));
    expect(await db.outbox.count()).toBe(0);
  });
});

describe('sync engine: joining a shared garden', () => {
  it('fills a new device from a snapshot and switches to it', async () => {
    const { ws, garden, s } = await claimed();
    const name = ws.name;
    await resetDb(); // a fresh device
    s.roles.set('me', 'helper');
    await joinWorkspace(s.t('me'), { id: ws.id, name }, NOW + 500);
    expect((await db.workspaces.get(ws.id))?.mode).toBe('synced');
    expect(await getMeta('activeWorkspaceId')).toBe(ws.id);
    expect((await db.gardens.get(garden.id))?.name).toBe('Balcony');
    expect(await db.specimens.count()).toBe(1);
    // Nothing to review: this device had no waiting changes.
    expect(await getMeta(reviewKey(ws.id))).toBeUndefined();
    await applySnapshot(s.t('me'), ws.id);
    expect(await db.specimens.count()).toBe(1);
  });
});
