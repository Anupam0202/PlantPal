// @vitest-environment node
import type { LayoutBody, OutboxOp } from '@plantpal/schemas';
import {
  applyOp,
  applyPush,
  MemorySyncRepo,
  pullChanges,
  ROLES,
  snapshot,
  SyncAccessError,
  type Role,
} from '@plantpal/sync';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createContainer,
  createGarden,
  createSpecimen,
  createZone,
  ensureWorkspace,
  logCare,
  logTask,
  updateSpecimen,
  voidEntry,
  voidTask,
} from '../../src/data/commands';
import {
  closeHealthCase,
  createLayout,
  deleteLayout,
  deleteZone,
  logHarvest,
  logVisit,
  movePantryItem,
  openHealthCase,
  saveLayout,
  updateContainer,
  updateGarden,
  updateZone,
} from '../../src/data/commands';
import { db } from '../../src/data/db';
import { resetDb } from '../data/helpers';

const NOW = Date.UTC(2026, 9, 29, 6, 0);

async function syncedGarden(name = 'Balcony') {
  const ws = await ensureWorkspace(NOW);
  await db.workspaces.put({ ...ws, mode: 'synced' });
  const garden = await createGarden(
    { name, timezone: 'Asia/Kolkata', hemisphere: 'north', place: null, notes: '' },
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
      plantedOn: '2026-10-01',
      status: 'active',
      notes: '',
    },
    NOW,
  );
  return { ws, garden, zone, container, plant };
}

const ops = async () => (await db.outbox.orderBy('createdAt').toArray()) as OutboxOp[];
const owner = async () => 'owner' as Role;

beforeEach(resetDb);

describe('push: a synced garden goes up as the client queued it', () => {
  it('applies every op in order, and replaying the same push changes nothing', async () => {
    const { plant } = await syncedGarden();
    await updateSpecimen(plant.id, 1, { displayName: 'Sweet basil' }, NOW + 1);
    await logCare(
      {
        gardenId: plant.gardenId,
        specimenIds: [plant.id],
        kind: 'water',
        amountMl: 300,
        waterSource: 'rain',
        notes: '',
      },
      NOW + 2,
    );
    const queued = await ops();
    expect(queued.map((o) => o.type)).toEqual([
      'garden.create',
      'zone.create',
      'container.create',
      'specimen.create',
      'specimen.update',
      'careEvent.create',
    ]);
    const repo = new MemorySyncRepo();
    const first = await applyPush(repo, owner, 'u-owner', queued, NOW + 10);
    expect(first.map((r) => r.status)).toEqual(Array(6).fill('applied'));
    expect((await repo.getRecord('specimen', plant.id))?.version).toBe(2);

    const again = await applyPush(repo, owner, 'u-owner', queued, NOW + 20);
    expect(again.every((r) => r.status === 'duplicate')).toBe(true);
    expect(repo.changes).toHaveLength(6);
  });

  it('the same op id with different data is refused', async () => {
    await syncedGarden();
    const [g] = await ops();
    const repo = new MemorySyncRepo();
    await applyOp(repo, { id: 'u', role: 'owner' }, g!, NOW);
    const tampered = { ...g!, payload: { ...(g!.payload as object), name: 'Something else' } };
    const r = await applyOp(repo, { id: 'u', role: 'owner' }, tampered, NOW);
    expect(r).toMatchObject({ status: 'rejected', code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('a stale update is a conflict that carries the server copy', async () => {
    const { plant } = await syncedGarden();
    const repo = new MemorySyncRepo();
    await applyPush(repo, owner, 'u', await ops(), NOW);
    // Two devices edit version 1.
    const a = await updateSpecimen(plant.id, 1, { displayName: 'From phone' }, NOW + 1);
    const opA = (await ops()).at(-1)!;
    expect((await applyOp(repo, { id: 'u', role: 'owner' }, opA, NOW + 2)).status).toBe('applied');
    const opB: OutboxOp = {
      ...opA,
      opId: '01JBZZZZZZZZZZZZZZZZZZZZZZ',
      payload: { ...a, displayName: 'From laptop' },
    };
    const r = await applyOp(repo, { id: 'u', role: 'owner' }, opB, NOW + 3);
    expect(r).toMatchObject({ status: 'conflict', code: 'VERSION_CONFLICT', version: 2 });
    expect((r.server as { displayName: string }).displayName).toBe('From phone');
  });

  it('validates the record, its ids and every reference', async () => {
    const { plant } = await syncedGarden();
    const repo = new MemorySyncRepo();
    const all = await ops();
    await applyPush(repo, owner, 'u', all, NOW);
    const sp = all.find((o) => o.type === 'specimen.create')!;
    const bad = (patch: object, over: Partial<OutboxOp> = {}): OutboxOp => ({
      ...sp,
      opId: `01JC${Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(22, '0')}`.slice(0, 26),
      entityId: '01JCAAAAAAAAAAAAAAAAAAAAAA',
      payload: { ...(sp.payload as object), id: '01JCAAAAAAAAAAAAAAAAAAAAAA', ...patch },
      ...over,
    });
    const actor = { id: 'u', role: 'owner' as const };
    expect(await applyOp(repo, actor, bad({ displayName: 123 }), NOW)).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await applyOp(repo, actor, bad({}, { entityId: plant.id }), NOW)).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await applyOp(repo, actor, bad({ zoneId: '01JCBBBBBBBBBBBBBBBBBBBBBB' }), NOW)).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(await applyOp(repo, actor, bad({}, { type: 'specimen.void' }), NOW)).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await applyOp(repo, actor, bad({}, { type: 'compost.create' }), NOW)).toMatchObject({
      code: 'UNKNOWN_ENTITY',
    });
  });

  it('never lets a record point into another workspace', async () => {
    const a = await syncedGarden('A');
    const repo = new MemorySyncRepo();
    await applyPush(repo, owner, 'u', await ops(), NOW);
    // Workspace B tries to reference A's zone and to overwrite A's plant.
    const sp = (await ops()).find((o) => o.type === 'specimen.create')!;
    const otherWs = '01JDWWWWWWWWWWWWWWWWWWWWWW';
    const intoB: OutboxOp = {
      ...sp,
      opId: '01JDOOOOOOOOOOOOOOOOOOOOOO'.replace(/O/g, '1'),
      workspaceId: otherWs,
      entityId: '01JDSSSSSSSSSSSSSSSSSSSSSS',
      payload: { ...(sp.payload as object), id: '01JDSSSSSSSSSSSSSSSSSSSSSS', workspaceId: otherWs },
    };
    expect(await applyOp(repo, { id: 'u', role: 'owner' }, intoB, NOW)).toMatchObject({ code: 'FORBIDDEN' });
    const overwrite: OutboxOp = {
      ...sp,
      opId: '01JDXXXXXXXXXXXXXXXXXXXXXX',
      workspaceId: otherWs,
      payload: { ...(sp.payload as object), workspaceId: otherWs },
    };
    expect(await applyOp(repo, { id: 'u', role: 'owner' }, overwrite, NOW)).toMatchObject({
      code: 'FORBIDDEN',
    });
    expect((await repo.getRecord('specimen', a.plant.id))?.workspaceId).toBe(a.ws.id);
  });

  it('two people completing the same task: the first wins, the second is a linked duplicate', async () => {
    const { garden, plant } = await syncedGarden();
    const repo = new MemorySyncRepo();
    await applyPush(repo, owner, 'u', await ops(), NOW);
    const key = `water.${plant.id}.2026-10-29`;
    const input = {
      gardenId: garden.id,
      occurrenceKey: key,
      scheduleId: null,
      specimenId: plant.id,
      kind: 'water' as const,
      action: 'done' as const,
      dueAt: NOW,
    };
    const mine = await logTask(input, NOW + 1);
    const mineOps = (await ops()).slice(-2);
    expect((await applyPush(repo, owner, 'u', mineOps, NOW + 2)).map((r) => r.status)).toEqual([
      'applied',
      'applied',
    ]);

    // The other device's completion of the same occurrence (different ids).
    const theirs = mineOps.map((o, i): OutboxOp => {
      const id = `01JE${String(i).repeat(22)}`;
      return {
        ...o,
        opId: `01JF${String(i).repeat(22)}`,
        entityId: id,
        payload: { ...(o.payload as object), id, opId: `01JG${String(i).repeat(22)}`, careEventId: null },
      };
    });
    const r = await applyPush(repo, owner, 'u2', theirs, NOW + 3);
    expect(r.map((x) => x.status)).toEqual(['duplicate', 'duplicate']);
    expect(r[1]?.existingId).toBe(mine.id);

    // After the first completion is undone, a new completion counts.
    await voidTask(mine.id, NOW + 4);
    const undo = (await ops()).slice(-2);
    expect(undo.map((o) => o.type)).toEqual(['taskLog.void', 'careEvent.void']);
    expect((await applyPush(repo, owner, 'u', undo, NOW + 5)).map((r) => r.status)).toEqual([
      'applied',
      'applied',
    ]);
    const retry = { ...theirs[1]!, opId: '01JHHHHHHHHHHHHHHHHHHHHHHH' };
    expect((await applyOp(repo, { id: 'u2', role: 'owner' }, retry, NOW + 6)).status).toBe('applied');
  });
});

describe('authorization matrix for push (§6.11)', () => {
  const ALLOWED: Record<Role | 'none', ReadonlySet<string>> = {
    owner: new Set([
      'garden.create',
      'zone.create',
      'container.create',
      'specimen.create',
      'careEvent.create',
      'specimen.update',
      'garden.delete',
    ]),
    gardener: new Set([
      'garden.create',
      'zone.create',
      'container.create',
      'specimen.create',
      'careEvent.create',
      'specimen.update',
    ]),
    helper: new Set(['careEvent.create']),
    viewer: new Set(),
    none: new Set(),
  };

  for (const role of [...ROLES, 'none'] as const) {
    it(`${role}: only the allowed changes go through`, async () => {
      const { plant, garden } = await syncedGarden();
      await logCare(
        {
          gardenId: garden.id,
          specimenIds: [plant.id],
          kind: 'water',
          amountMl: 200,
          waterSource: 'tap',
          notes: '',
        },
        NOW + 1,
      );
      await updateSpecimen(plant.id, 1, { displayName: 'Renamed' }, NOW + 2);
      const all = await ops();
      const repo = new MemorySyncRepo();
      // The structure exists already (pushed by the owner), so each op is judged on permission alone.
      await applyPush(
        repo,
        owner,
        'owner',
        all.filter((o) => o.type.endsWith('.create') && !o.type.startsWith('careEvent')),
        NOW,
      );
      const del: OutboxOp = {
        ...all[0]!,
        opId: '01JKKKKKKKKKKKKKKKKKKKKKKK',
        type: 'garden.delete',
        payload: null,
        baseVersion: 1,
      };
      const tried = [
        all.find((o) => o.type === 'careEvent.create')!,
        all.find((o) => o.type === 'specimen.update')!,
        del,
      ];
      const roleOf = async () => (role === 'none' ? null : role);
      const res = await applyPush(repo, roleOf, `u-${role}`, tried, NOW + 5);
      tried.forEach((op, i) => {
        const allowed = ALLOWED[role].has(op.type);
        expect(res[i]!.status === 'applied', `${role} ${op.type}`).toBe(allowed);
        if (!allowed) expect(res[i]!.code, `${role} ${op.type}`).toBe('FORBIDDEN');
      });
    });
  }
});

describe('pull and snapshot', () => {
  it('pages changes with current records, tombstones included; members only', async () => {
    const { ws, garden, plant } = await syncedGarden();
    await logCare(
      {
        gardenId: garden.id,
        specimenIds: [plant.id],
        kind: 'water',
        amountMl: 200,
        waterSource: 'tap',
        notes: '',
      },
      NOW + 1,
    );
    const repo = new MemorySyncRepo();
    await applyPush(repo, owner, 'u', await ops(), NOW);
    const care = (await db.careEvents.toArray())[0]!;
    await voidEntry('careEvents', care.id, NOW + 2);
    await applyPush(repo, owner, 'u', (await ops()).slice(-1), NOW + 3);

    const p1 = await pullChanges(repo, 'viewer', ws.id, 0, 4);
    expect(p1.changes.map((c) => c.entity)).toEqual(['garden', 'zone', 'container', 'specimen']);
    expect(p1.hasMore).toBe(true);
    const p2 = await pullChanges(repo, 'viewer', ws.id, p1.cursor, 4);
    expect(p2.changes.map((c) => c.op)).toEqual(['upsert', 'delete']);
    expect((p2.changes[1]!.record as { deletedAt: number }).deletedAt).toBe(NOW + 3);
    expect(p2.hasMore).toBe(false);

    await expect(pullChanges(repo, null, ws.id, 0)).rejects.toBeInstanceOf(SyncAccessError);
    const snap = await snapshot(repo, 'helper', ws.id);
    expect(snap.records.map((r) => r.entity).sort()).toEqual(['container', 'garden', 'specimen', 'zone']);
    expect(snap.cursor).toBe(p2.cursor);
  });

  it('an old cursor past the pruned horizon must take a snapshot', async () => {
    const { ws } = await syncedGarden();
    const repo = new MemorySyncRepo();
    await applyPush(repo, owner, 'u', await ops(), NOW);
    repo.prune(ws.id, NOW + 1);
    await expect(pullChanges(repo, 'owner', ws.id, 1)).rejects.toMatchObject({ code: 'SNAPSHOT_REQUIRED' });
    expect((await pullChanges(repo, 'owner', ws.id, 0)).changes).toEqual([]);
  });
});

describe('contract: the server accepts everything the client queues', () => {
  it('edits, cascades, completions, health cases, layouts, pantry and nature visits all apply', async () => {
    const { garden, zone, container, plant } = await syncedGarden();
    await updateGarden(garden.id, 1, { name: 'Terrace' }, NOW + 1);
    await updateZone(zone.id, 1, { name: 'South rail' }, NOW + 2);
    await updateContainer(container.id, 1, { name: 'Big pot' }, NOW + 3);
    // A soil check that teaches the pot its water factor (a container update).
    await logTask(
      {
        gardenId: garden.id,
        occurrenceKey: `check.${plant.id}.2026-10-29`,
        scheduleId: null,
        specimenId: plant.id,
        kind: 'check-water',
        action: 'checked',
        dueAt: NOW,
        check: { soil: 'wet', leaves: null, pests: null },
        predicted: 'dry',
      },
      NOW + 4,
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
    const hc = await openHealthCase(
      {
        gardenId: garden.id,
        specimenId: plant.id,
        title: 'Basil',
        entries: [{ kind: 'questionnaire', by: 'user', payload: q }],
        followUpDays: [3, 7],
      },
      NOW + 5,
    );
    await closeHealthCase(hc.id, hc.version, 'resolved', '', NOW + 6);
    const body: LayoutBody = {
      name: 'Plan',
      frame: { frame: 'local-metric', unit: 'm', origin: [0, 0], rotationDeg: 0 },
      outline: [
        [0, 0],
        [2, 0],
        [2, 1],
        [0, 1],
      ],
      items: [],
    };
    const l = await createLayout(garden.id, { zoneId: zone.id, body }, NOW + 7);
    await saveLayout(l.id, 1, { ...body, name: 'Plan 2' }, '', NOW + 8);
    await deleteLayout(l.id, 2, NOW + 9);
    const h = await logHarvest(
      {
        gardenId: garden.id,
        specimenId: plant.id,
        plantName: 'Basil',
        massG: 40,
        count: null,
        countLabel: null,
        notes: '',
        toPantry: { bestBefore: null },
      },
      NOW + 10,
    );
    const [p] = await db.pantryItems.where('harvestId').equals(h.id).toArray();
    await movePantryItem(p!.id, 1, 'given', NOW + 11);
    await logVisit(
      {
        gardenId: garden.id,
        protocol: 'sighting',
        startedAt: NOW,
        plannedS: 0,
        durationS: 0,
        specimenId: plant.id,
        records: [
          {
            group: 'bee',
            taxonName: null,
            count: 2,
            state: 'YES',
            identityConfidence: 'confident',
            behaviour: 'visiting-flower',
          },
        ],
      },
      NOW + 12,
    );
    await deleteZone(zone.id, 2, NOW + 13);

    const queued = await ops();
    const types = new Set(queued.map((o) => o.type));
    for (const t of [
      'container.update',
      'careSchedule.create',
      'careSchedule.delete',
      'healthCase.update',
      'layout.delete',
      'pantryItem.update',
      'natureVisit.create',
      'zone.delete',
      'container.delete',
    ])
      expect(types, t).toContain(t);
    const res = await applyPush(new MemorySyncRepo(), owner, 'u', queued, NOW + 20);
    const bad = res.map((r, i) => ({ r, op: queued[i]! })).filter(({ r }) => r.status !== 'applied');
    expect(bad.map(({ r, op }) => `${op.type}: ${r.status} ${r.code} ${r.message}`)).toEqual([]);
  });
});
