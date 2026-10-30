import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newId } from '@plantpal/domain';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { Problem } from '@plantpal/schemas';
import { PullResponse, PushResponse, SnapshotResponse, type Role } from '@plantpal/sync';
import { createApp } from '../src/app';
import { AccountsStore } from '../src/lib/accounts';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { MemoryStatusStore } from '../src/lib/status-store';
import { D1SyncRepo } from '../src/lib/sync-repo';
import type { Authenticator } from '../src/routes/accounts';
import { createD1 } from './d1-shim';

const T0 = Date.UTC(2026, 9, 1, 9);
const DAY = 86_400_000;
const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url).pathname, 'utf8');

/** Tests sign in with a header; the Worker uses passkey sessions. */
const auth: Authenticator = {
  userOf: async (req) => {
    const id = req.headers.get('x-test-user');
    return id ? { id, name: id } : null;
  },
};

const OWNER = 'u-owner';
const PEOPLE: Record<Exclude<Role, 'owner'>, string> = {
  gardener: 'u-gardener',
  helper: 'u-helper',
  viewer: 'u-viewer',
};
const STRANGER = 'u-stranger';

const versioned = (ws: string, id: string) => ({
  id,
  workspaceId: ws,
  createdAt: T0,
  updatedAt: T0,
  version: 1,
  deletedAt: null,
});
const gardenOf = (ws: string, id: string) => ({
  ...versioned(ws, id),
  name: 'Balcony',
  timezone: 'Asia/Kolkata',
  hemisphere: 'north',
  place: null,
  region: null,
  profile: null,
  notes: '',
  source: null,
});
const zoneOf = (ws: string, id: string, gardenId: string, name: string) => ({
  ...versioned(ws, id),
  gardenId,
  name,
  kind: 'balcony',
  covered: false,
  areaM2: null,
  orientationDeg: null,
  light: null,
  sun: null,
  indoorLight: null,
  clearanceCm: null,
  maxContainerL: null,
  wind: null,
  drainage: null,
  notes: '',
  source: null,
});
const plantOf = (ws: string, id: string, gardenId: string, zoneId: string, name: string) => ({
  ...versioned(ws, id),
  gardenId,
  zoneId,
  containerId: null,
  displayName: name,
  scientificName: null,
  cultivar: null,
  taxonKey: null,
  catalogTaxonId: null,
  identityLevel: 'unknown',
  origin: 'unknown',
  parentSpecimenId: null,
  plantedOn: null,
  status: 'active',
  statusReason: null,
  holding: false,
  coverMediaId: null,
  notes: '',
  source: null,
});
const careOf = (ws: string, gardenId: string, specimenId: string) => {
  const id = newId(T0);
  return {
    id,
    opId: newId(T0),
    workspaceId: ws,
    gardenId,
    createdAt: T0,
    deletedAt: null,
    occurredAt: T0,
    occurredOn: '2026-10-01',
    dateUncertain: false,
    specimenId,
    kind: 'water',
    amountMl: 500,
    waterSource: 'tap',
    occurrenceKey: null,
    notes: '',
    mediaIds: [],
    source: null,
  };
};

async function setup(opts: { capacity?: number } = {}) {
  const d1 = createD1();
  await d1.exec(sql('0001_provider_status.sql'));
  await d1.exec(sql('0002_sync.sql'));
  let now = T0;
  const app = createApp({
    env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
    status: new MemoryStatusStore(),
    limiter: new MemoryRateLimiter(opts.capacity ?? 1000, 100, () => now),
    mode: 'mock',
    allowedOrigins: ['https://plantpal.example'],
    traceId: () => 'trace-1',
    accounts: { accounts: new AccountsStore(d1), sync: new D1SyncRepo(d1), auth, now: () => now },
  });
  const call = (user: string | null, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return { d1, call, clock: { set: (t: number) => (now = t) } };
}

/** A workspace with an owner, one member per role, a garden, two spaces and a plant in each. */
async function seeded(opts: { capacity?: number } = {}) {
  const s = await setup(opts);
  const ws = newId(T0);
  const ids = {
    ws,
    garden: newId(T0),
    rail: newId(T0),
    sill: newId(T0),
    basil: newId(T0),
    fern: newId(T0),
  };
  expect((await s.call(OWNER, 'POST', '/api/v1/workspaces', { id: ws, name: 'Home' })).status).toBe(201);
  for (const [role, user] of Object.entries(PEOPLE)) {
    const inv = await s.call(OWNER, 'POST', `/api/v1/workspaces/${ws}/invitations`, { role });
    expect(inv.status).toBe(201);
    const { token } = (await inv.json()) as { token: string };
    const ok = await s.call(user, 'POST', '/api/v1/invitations/accept', { token });
    expect(await ok.json()).toEqual({ workspaceId: ws, role });
  }
  const op = (type: string, payload: { id: string }, baseVersion: number | null = null) => ({
    opId: newId(T0),
    workspaceId: ws,
    type,
    entityId: payload.id,
    payload,
    baseVersion,
    createdAt: T0,
    clientSchema: 7,
    state: 'pending',
  });
  const push = async (user: string | null, ops: unknown[]) => {
    const res = await s.call(user, 'POST', '/api/v1/sync/push', { ops });
    return { res, body: res.status === 200 ? PushResponse.parse(await res.json()) : null };
  };
  const seed = await push(OWNER, [
    op('garden.create', gardenOf(ws, ids.garden)),
    op('zone.create', zoneOf(ws, ids.rail, ids.garden, 'Railing')),
    op('zone.create', zoneOf(ws, ids.sill, ids.garden, 'Kitchen sill')),
    op('specimen.create', plantOf(ws, ids.basil, ids.garden, ids.rail, 'Basil')),
    op('specimen.create', plantOf(ws, ids.fern, ids.garden, ids.sill, 'Fern')),
  ]);
  expect(seed.body?.results.map((r) => r.status)).toEqual(Array(5).fill('applied'));
  return { ...s, ids, op, push };
}

const problemOf = async (res: Response) => Problem.parse(await res.json());

describe('accounts and sync API: sign-in', () => {
  it('answers 401 on every account route without a session', async () => {
    const { call, ids, op } = await seeded();
    const ws = ids.ws;
    const routes: Array<[string, string, unknown?]> = [
      ['GET', '/api/v1/me'],
      ['POST', '/api/v1/workspaces', { id: newId(T0), name: 'x' }],
      ['POST', '/api/v1/sync/push', { ops: [op('careEvent.create', careOf(ws, ids.garden, ids.basil))] }],
      ['GET', `/api/v1/sync/pull?workspace=${ws}`],
      ['GET', `/api/v1/sync/snapshot?workspace=${ws}`],
      ['GET', `/api/v1/workspaces/${ws}/members`],
      ['PATCH', `/api/v1/workspaces/${ws}/members/${PEOPLE.viewer}`, { role: 'helper' }],
      ['DELETE', `/api/v1/workspaces/${ws}/members/${PEOPLE.viewer}`],
      ['POST', `/api/v1/workspaces/${ws}/invitations`, { role: 'viewer' }],
      ['POST', '/api/v1/invitations/accept', { token: 'x'.repeat(43) }],
      [
        'POST',
        `/api/v1/workspaces/${ws}/share-links`,
        { gardenId: ids.garden, zoneIds: [ids.rail], label: 'Asha', startsAt: T0, expiresAt: T0 + DAY },
      ],
      ['GET', `/api/v1/workspaces/${ws}/share-links`],
      ['DELETE', `/api/v1/workspaces/${ws}/share-links/${newId(T0)}`],
      ['GET', `/api/v1/workspaces/${ws}/share-links/${newId(T0)}/summary`],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(null, method, path, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect((await problemOf(res)).code).toBe('UNAUTHENTICATED');
    }
  });

  it('lists the person’s workspaces with their role', async () => {
    const { call, ids } = await seeded();
    const me = (await (await call(PEOPLE.helper, 'GET', '/api/v1/me')).json()) as {
      workspaces: Array<{ id: string; role: string }>;
    };
    expect(me.workspaces).toEqual([{ id: ids.ws, name: 'Home', role: 'helper' }]);
    const none = (await (await call(STRANGER, 'GET', '/api/v1/me')).json()) as { workspaces: unknown[] };
    expect(none.workspaces).toEqual([]);
  });

  it('lets the owner claim a workspace again, and nobody else', async () => {
    const { call, ids } = await seeded();
    const again = await call(OWNER, 'POST', '/api/v1/workspaces', { id: ids.ws, name: 'Renamed' });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id: ids.ws, name: 'Home', role: 'owner' });
    for (const user of [STRANGER, PEOPLE.gardener]) {
      const res = await call(user, 'POST', '/api/v1/workspaces', { id: ids.ws, name: 'Mine now' });
      expect(res.status).toBe(403);
    }
  });
});

describe('accounts and sync API: authorization matrix', () => {
  type Who = Role | 'stranger';
  const userOf = (who: Who) => (who === 'owner' ? OWNER : who === 'stranger' ? STRANGER : PEOPLE[who]);
  const expected: Record<
    Who,
    { read: number; care: string; editSpace: string; deleteGarden: string; manage: number }
  > = {
    owner: { read: 200, care: 'applied', editSpace: 'applied', deleteGarden: 'applied', manage: 2 },
    gardener: { read: 200, care: 'applied', editSpace: 'applied', deleteGarden: 'FORBIDDEN', manage: 403 },
    helper: { read: 200, care: 'applied', editSpace: 'FORBIDDEN', deleteGarden: 'FORBIDDEN', manage: 403 },
    viewer: { read: 200, care: 'FORBIDDEN', editSpace: 'FORBIDDEN', deleteGarden: 'FORBIDDEN', manage: 403 },
    stranger: {
      read: 403,
      care: 'FORBIDDEN',
      editSpace: 'FORBIDDEN',
      deleteGarden: 'FORBIDDEN',
      manage: 403,
    },
  };

  it.each(Object.keys(expected) as Who[])('%s', async (who) => {
    const { call, ids, op, push } = await seeded();
    const user = userOf(who);
    const want = expected[who];
    const ws = ids.ws;

    for (const path of [
      `/api/v1/sync/pull?workspace=${ws}`,
      `/api/v1/sync/snapshot?workspace=${ws}`,
      `/api/v1/workspaces/${ws}/members`,
    ])
      expect((await call(user, 'GET', path)).status, path).toBe(want.read);

    const outcome = (r: { status: string; code: string | null }) =>
      r.status === 'applied' ? 'applied' : r.code;
    const care = await push(user, [op('careEvent.create', careOf(ws, ids.garden, ids.basil))]);
    expect(outcome(care.body!.results[0]!)).toBe(want.care);
    const renamed = { ...zoneOf(ws, ids.rail, ids.garden, 'South railing'), version: 2, updatedAt: T0 + 1 };
    const edit = await push(user, [op('zone.update', renamed, 1)]);
    expect(outcome(edit.body!.results[0]!)).toBe(want.editSpace);
    const del = await push(user, [{ ...op('garden.delete', { id: ids.garden }, 1), payload: null }]);
    expect(outcome(del.body!.results[0]!)).toBe(want.deleteGarden);

    // Owner-only management: invitations, roles, sitter links.
    const manage = [
      await call(user, 'POST', `/api/v1/workspaces/${ws}/invitations`, { role: 'viewer' }),
      await call(user, 'PATCH', `/api/v1/workspaces/${ws}/members/${PEOPLE.viewer}`, { role: 'helper' }),
      await call(user, 'GET', `/api/v1/workspaces/${ws}/share-links`),
    ];
    for (const res of manage)
      if (want.manage === 403) expect(res.status).toBe(403);
      else expect(res.status).toBeLessThan(300);
  });

  it('keeps writes inside the workspace the person belongs to', async () => {
    const a = await seeded();
    const other = newId(T0);
    expect((await a.call(STRANGER, 'POST', '/api/v1/workspaces', { id: other, name: 'Theirs' })).status).toBe(
      201,
    );
    // A stranger writing into the owner's workspace, and the owner pointing at a garden in another one.
    const intrude = await a.push(STRANGER, [
      a.op('careEvent.create', careOf(a.ids.ws, a.ids.garden, a.ids.basil)),
    ]);
    expect(intrude.body!.results[0]).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
    const otherGarden = newId(T0);
    const theirs = await a.push(STRANGER, [
      { ...a.op('garden.create', gardenOf(other, otherGarden)), workspaceId: other },
    ]);
    expect(theirs.body!.results[0]!.status).toBe('applied');
    const cross = await a.push(OWNER, [
      a.op('zone.create', zoneOf(a.ids.ws, newId(T0), otherGarden, 'Sneaky')),
    ]);
    expect(cross.body!.results[0]).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
  });

  it('pulls changes in pages and asks for a snapshot below the change floor', async () => {
    const { call, d1, ids } = await seeded();
    const first = PullResponse.parse(
      await (await call(PEOPLE.viewer, 'GET', `/api/v1/sync/pull?workspace=${ids.ws}&limit=2`)).json(),
    );
    expect(first.changes.map((c) => c.entity)).toEqual(['garden', 'zone']);
    expect(first.hasMore).toBe(true);
    const rest = PullResponse.parse(
      await (
        await call(PEOPLE.viewer, 'GET', `/api/v1/sync/pull?workspace=${ids.ws}&cursor=${first.cursor}`)
      ).json(),
    );
    expect(rest.changes).toHaveLength(3);
    expect(rest.hasMore).toBe(false);
    const snap = SnapshotResponse.parse(
      await (await call(PEOPLE.viewer, 'GET', `/api/v1/sync/snapshot?workspace=${ids.ws}`)).json(),
    );
    expect(snap.records).toHaveLength(5);
    expect(snap.cursor).toBe(rest.cursor);

    await d1.exec(`UPDATE workspaces SET change_floor = ${rest.cursor} WHERE id = '${ids.ws}'`);
    const old = await call(PEOPLE.viewer, 'GET', `/api/v1/sync/pull?workspace=${ids.ws}&cursor=1`);
    expect(old.status).toBe(409);
    expect((await problemOf(old)).code).toBe('SNAPSHOT_REQUIRED');
  });

  it('limits pushes per person and the size of a push', async () => {
    const { push, op, ids } = await seeded({ capacity: 3 });
    const tooMany = Array.from({ length: 101 }, () =>
      op('careEvent.create', careOf(ids.ws, ids.garden, ids.basil)),
    );
    expect((await push(PEOPLE.gardener, tooMany)).res.status).toBe(400);
    const one = () => [op('careEvent.create', careOf(ids.ws, ids.garden, ids.basil))];
    for (let i = 0; i < 3; i++) expect((await push(PEOPLE.gardener, one())).res.status).toBe(200);
    const slow = await push(PEOPLE.gardener, one());
    expect(slow.res.status).toBe(429);
    expect(slow.res.headers.get('retry-after')).not.toBeNull();
    // Another person has their own allowance.
    expect((await push(PEOPLE.helper, one())).res.status).toBe(200);
  });
});

describe('accounts and sync API: members and invitations', () => {
  it('changes roles, and a demoted member loses access at once', async () => {
    const { call, push, op, ids } = await seeded();
    const res = await call(OWNER, 'PATCH', `/api/v1/workspaces/${ids.ws}/members/${PEOPLE.gardener}`, {
      role: 'viewer',
    });
    expect(await res.json()).toMatchObject({ userId: PEOPLE.gardener, role: 'viewer' });
    const after = await push(PEOPLE.gardener, [
      op('careEvent.create', careOf(ids.ws, ids.garden, ids.basil)),
    ]);
    expect(after.body!.results[0]!.code).toBe('FORBIDDEN');
    const missing = await call(OWNER, 'PATCH', `/api/v1/workspaces/${ids.ws}/members/${STRANGER}`, {
      role: 'viewer',
    });
    expect(missing.status).toBe(404);
  });

  it('keeps at least one owner', async () => {
    const { call, ids } = await seeded();
    const demote = await call(OWNER, 'PATCH', `/api/v1/workspaces/${ids.ws}/members/${OWNER}`, {
      role: 'gardener',
    });
    expect(demote.status).toBe(400);
    expect((await call(OWNER, 'DELETE', `/api/v1/workspaces/${ids.ws}/members/${OWNER}`)).status).toBe(400);
    // With a second owner, the first may step down.
    await call(OWNER, 'PATCH', `/api/v1/workspaces/${ids.ws}/members/${PEOPLE.gardener}`, { role: 'owner' });
    expect(
      (await call(OWNER, 'PATCH', `/api/v1/workspaces/${ids.ws}/members/${OWNER}`, { role: 'gardener' }))
        .status,
    ).toBe(200);
  });

  it('lets members leave, and only owners remove others', async () => {
    const { call, ids } = await seeded();
    const path = (u: string) => `/api/v1/workspaces/${ids.ws}/members/${u}`;
    expect((await call(PEOPLE.helper, 'DELETE', path(PEOPLE.viewer))).status).toBe(403);
    expect((await call(STRANGER, 'DELETE', path(PEOPLE.viewer))).status).toBe(403);
    expect((await call(PEOPLE.helper, 'DELETE', path(PEOPLE.helper))).status).toBe(204);
    expect((await call(PEOPLE.helper, 'GET', `/api/v1/sync/snapshot?workspace=${ids.ws}`)).status).toBe(403);
    expect((await call(OWNER, 'DELETE', path(PEOPLE.viewer))).status).toBe(204);
    const members = (await (await call(OWNER, 'GET', `/api/v1/workspaces/${ids.ws}/members`)).json()) as {
      members: Array<{ userId: string }>;
    };
    expect(members.members.map((m) => m.userId).sort()).toEqual([OWNER, PEOPLE.gardener].sort());
  });

  it('uses each invitation once, until it expires', async () => {
    const { call, clock, ids } = await seeded();
    const make = async (ttlHours: number) =>
      (
        (await (
          await call(OWNER, 'POST', `/api/v1/workspaces/${ids.ws}/invitations`, { role: 'helper', ttlHours })
        ).json()) as { token: string }
      ).token;
    const once = await make(24);
    expect((await call(STRANGER, 'POST', '/api/v1/invitations/accept', { token: once })).status).toBe(200);
    const reused = await call('u-late', 'POST', '/api/v1/invitations/accept', { token: once });
    expect(reused.status).toBe(410);
    const late = await make(1);
    clock.set(T0 + 2 * 3_600_000);
    expect((await call('u-late', 'POST', '/api/v1/invitations/accept', { token: late })).status).toBe(410);
    const unknown = await call('u-late', 'POST', '/api/v1/invitations/accept', { token: 'y'.repeat(43) });
    expect(unknown.status).toBe(404);
    // An existing member keeps their role when they open another invitation.
    const extra = await make(24);
    const mine = await call(PEOPLE.gardener, 'POST', '/api/v1/invitations/accept', { token: extra });
    expect(await mine.json()).toEqual({ workspaceId: ids.ws, role: 'gardener' });
  });
});

describe('accounts and sync API: plant-sitter links', () => {
  async function withLink(window = { startsAt: T0, expiresAt: T0 + 7 * DAY }) {
    const s = await seeded();
    const res = await s.call(OWNER, 'POST', `/api/v1/workspaces/${s.ids.ws}/share-links`, {
      gardenId: s.ids.garden,
      zoneIds: [s.ids.rail],
      label: 'Asha',
      ...window,
    });
    expect(res.status).toBe(201);
    const link = (await res.json()) as { id: string; token: string };
    const share = (method: string, body?: unknown, token = link.token) =>
      s.call(null, method, `/api/v1/share/${token}${method === 'POST' ? '/care' : ''}`, body);
    return { ...s, link, share };
  }

  it('shows only the plants in the linked spaces, and logs care for them', async () => {
    const { share, ids, call, link } = await withLink();
    const view = (await (await share('GET')).json()) as {
      plants: Array<{ id: string; name: string; zone: string }>;
    };
    expect(view.plants).toEqual([{ id: ids.basil, name: 'Basil', zone: 'Railing' }]);

    const logged = await share('POST', { specimenId: ids.basil, kind: 'water', amountMl: 400 });
    expect(logged.status).toBe(201);
    const outside = await share('POST', { specimenId: ids.fern, kind: 'water', amountMl: 400 });
    expect(outside.status).toBe(403);
    const notAllowedKind = await share('POST', { specimenId: ids.basil, kind: 'prune' });
    expect(notAllowedKind.status).toBe(400);

    const after = (await (await share('GET')).json()) as {
      care: Array<{ specimenId: string; amountMl: number }>;
    };
    expect(after.care).toEqual([
      expect.objectContaining({ specimenId: ids.basil, kind: 'water', amountMl: 400 }),
    ]);

    // The owner sees what the sitter did, and it reaches every device through the change feed.
    const summary = (await (
      await call(OWNER, 'GET', `/api/v1/workspaces/${ids.ws}/share-links/${link.id}/summary`)
    ).json()) as { care: Array<{ notes: string }> };
    expect(summary.care).toHaveLength(1);
    expect(summary.care[0]!.notes).toContain('Plant sitter (Asha)');
    const pull = PullResponse.parse(
      await (await call(PEOPLE.viewer, 'GET', `/api/v1/sync/pull?workspace=${ids.ws}&cursor=5`)).json(),
    );
    expect(pull.changes.map((c) => c.entity)).toEqual(['careEvent']);
    expect(
      (await call(PEOPLE.gardener, 'GET', `/api/v1/workspaces/${ids.ws}/share-links/${link.id}/summary`))
        .status,
    ).toBe(403);
  });

  it('stops working once expired, before it starts, and when revoked', async () => {
    const early = await withLink({ startsAt: T0 + DAY, expiresAt: T0 + 3 * DAY });
    expect((await early.share('GET')).status).toBe(410);
    early.clock.set(T0 + DAY + 1);
    expect((await early.share('GET')).status).toBe(200);
    early.clock.set(T0 + 3 * DAY);
    expect((await early.share('GET')).status).toBe(410);
    expect((await early.share('POST', { specimenId: early.ids.basil, kind: 'water' })).status).toBe(410);

    const revoked = await withLink();
    expect(
      (
        await revoked.call(
          PEOPLE.gardener,
          'DELETE',
          `/api/v1/workspaces/${revoked.ids.ws}/share-links/${revoked.link.id}`,
        )
      ).status,
    ).toBe(403);
    expect((await revoked.share('GET')).status).toBe(200);
    expect(
      (
        await revoked.call(
          OWNER,
          'DELETE',
          `/api/v1/workspaces/${revoked.ids.ws}/share-links/${revoked.link.id}`,
        )
      ).status,
    ).toBe(204);
    expect((await revoked.share('GET')).status).toBe(410);
    expect((await revoked.share('POST', { specimenId: revoked.ids.basil, kind: 'water' })).status).toBe(410);
    const list = (await (
      await revoked.call(OWNER, 'GET', `/api/v1/workspaces/${revoked.ids.ws}/share-links`)
    ).json()) as { links: Array<Record<string, unknown>> };
    expect(list.links[0]!.revokedAt).toBe(T0);
    expect(list.links[0]).not.toHaveProperty('token');
    expect(list.links[0]).not.toHaveProperty('tokenHash');

    expect((await revoked.share('GET', undefined, 'z'.repeat(43))).status).toBe(404);
  });

  it('only links spaces in the workspace’s own garden, for at most 30 days', async () => {
    const { call, ids, push, op } = await seeded();
    const otherGarden = newId(T0);
    const otherZone = newId(T0);
    await push(OWNER, [
      op('garden.create', gardenOf(ids.ws, otherGarden)),
      op('zone.create', zoneOf(ids.ws, otherZone, otherGarden, 'Terrace')),
    ]);
    const make = (body: Record<string, unknown>) =>
      call(OWNER, 'POST', `/api/v1/workspaces/${ids.ws}/share-links`, {
        gardenId: ids.garden,
        zoneIds: [ids.rail],
        label: 'Asha',
        startsAt: T0,
        expiresAt: T0 + DAY,
        ...body,
      });
    expect((await make({ zoneIds: [otherZone] })).status).toBe(404);
    expect((await make({ gardenId: newId(T0) })).status).toBe(404);
    expect((await make({ expiresAt: T0 + 31 * DAY })).status).toBe(400);
    expect((await make({ expiresAt: T0 })).status).toBe(400);
    expect((await make({})).status).toBe(201);
  });
});
