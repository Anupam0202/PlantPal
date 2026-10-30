import { readFileSync } from 'node:fs';
import { cellToParent, gridDisk, latLngToCell } from 'h3-js';
import { describe, expect, it } from 'vitest';
import { EnvClient, MemoryCache } from '@plantpal/providers';
import { createApp } from '../src/app';
import { AccountsStore } from '../src/lib/accounts';
import { CommunityStore } from '../src/lib/community-store';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { MemoryStatusStore } from '../src/lib/status-store';
import { D1SyncRepo } from '../src/lib/sync-repo';
import type { Authenticator } from '../src/routes/accounts';
import { createD1 } from './d1-shim';

const T0 = Date.UTC(2026, 9, 30, 9);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const sql = (f: string) => readFileSync(new URL(`../migrations/${f}`, import.meta.url).pathname, 'utf8');

/** Tests sign in with headers; `x-test-age-hours` sets how old the account is. */
const auth = (now: () => number): Authenticator => ({
  userOf: async (req) => {
    const id = req.headers.get('x-test-user');
    if (!id) return null;
    const age = Number(req.headers.get('x-test-age-hours') ?? 1000);
    return { id, name: id, createdAt: now() - age * HOUR };
  },
});

const PUNE = latLngToCell(18.52, 73.86, 7);
const PUNE_AREA = cellToParent(PUNE, 5);
const NEXT_DOOR = gridDisk(PUNE, 1).find((c) => c !== PUNE && cellToParent(c, 5) === PUNE_AREA)!;
const SYDNEY = latLngToCell(-33.87, 151.21, 7);

async function setup(opts: { enabled?: boolean; turnstile?: { secret: string; fetch: typeof fetch } } = {}) {
  const d1 = createD1();
  for (const f of [
    '0001_provider_status.sql',
    '0002_sync.sql',
    '0003_auth.sql',
    '0004_push.sql',
    '0005_community.sql',
  ])
    await d1.exec(sql(f));
  let now = T0;
  const clock = () => now;
  const store = new CommunityStore(d1);
  const app = createApp({
    env: new EnvClient({ mode: 'mock', cache: new MemoryCache() }),
    status: new MemoryStatusStore(),
    limiter: new MemoryRateLimiter(1000, 100, clock),
    mode: 'mock',
    allowedOrigins: [],
    traceId: () => 'trace-1',
    accounts: { accounts: new AccountsStore(d1), sync: new D1SyncRepo(d1), auth: auth(clock) },
    community: {
      enabled: opts.enabled ?? true,
      store,
      minAccountHours: 24,
      turnstile: opts.turnstile ?? null,
      now: clock,
    },
  });
  const call = async (
    user: string | null,
    method: string,
    path: string,
    body?: unknown,
    ageHours?: number,
  ) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(user ? { 'x-test-user': user } : {}),
        ...(ageHours !== undefined ? { 'x-test-age-hours': String(ageHours) } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, any>) : null }; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const profile = (user: string, cell = PUNE, country: string | null = 'IN') =>
    call(user, 'PUT', '/api/v1/community/profile', {
      displayName: user.toUpperCase(),
      cell,
      country,
      bio: '',
    });
  return { d1, app, call, profile, store, advance: (ms: number) => (now += ms), clock };
}

const listing = (over: Record<string, unknown> = {}) => ({
  kind: 'seeds',
  title: 'Tulsi seeds',
  body: 'Saved from my balcony plant',
  scientificName: 'Ocimum tenuiflorum',
  quantity: '1 packet',
  pickup: 'Weekend mornings',
  ...over,
});

describe('community flag and profiles', () => {
  it('is off unless the owner turns it on', async () => {
    const { call } = await setup({ enabled: false });
    expect((await call('a', 'GET', '/api/v1/community/status')).body).toEqual({ enabled: false });
    expect((await call('a', 'GET', '/api/v1/community/feed')).status).toBe(404);
  });

  it('stores a coarse cell and its area, never coordinates', async () => {
    const { call, profile } = await setup();
    expect(
      (await call(null, 'PUT', '/api/v1/community/profile', { displayName: 'A', cell: PUNE, country: 'IN' }))
        .status,
    ).toBe(401);
    const precise = await call('a', 'PUT', '/api/v1/community/profile', {
      displayName: 'A',
      cell: PUNE,
      country: 'IN',
      lat: 18.5204,
      lon: 73.8567,
    });
    expect(precise.status).toBe(400);
    const fine = await call('a', 'PUT', '/api/v1/community/profile', {
      displayName: 'A',
      cell: latLngToCell(18.52, 73.86, 12),
      country: 'IN',
    });
    expect(fine.status).toBe(400);
    const saved = await profile('a');
    expect(saved.status).toBe(200);
    expect(saved.body!.profile).toMatchObject({
      cell: PUNE,
      area: PUNE_AREA,
      country: 'IN',
      status: 'active',
    });
  });
});

describe('posting rules', () => {
  it('needs a profile, an account older than a day, and respects the hourly limit', async () => {
    const { call, profile } = await setup();
    expect((await call('a', 'POST', '/api/v1/community/posts', { body: 'Hello' })).status).toBe(403);
    await profile('a');
    const young = await call('a', 'POST', '/api/v1/community/posts', { body: 'Hello' }, 2);
    expect(young.status).toBe(403);
    expect(young.body!.detail).toMatch(/after 24 hours/);
    for (let i = 0; i < 10; i++)
      expect((await call('a', 'POST', '/api/v1/community/posts', { body: `Post ${i}` })).status).toBe(201);
    const flood = await call('a', 'POST', '/api/v1/community/posts', { body: 'One more' });
    expect(flood.status).toBe(429);
  });

  it('checks Turnstile when it is configured', async () => {
    const seen: string[] = [];
    const { call, profile } = await setup({
      turnstile: {
        secret: 'ts-secret',
        fetch: async (_u, init) => {
          const body = JSON.parse(String(init?.body)) as { response: string };
          seen.push(body.response);
          return new Response(JSON.stringify({ success: body.response === 'good' }));
        },
      },
    });
    await profile('a');
    expect((await call('a', 'POST', '/api/v1/community/posts', { body: 'Hi' })).status).toBe(400);
    expect(
      (await call('a', 'POST', '/api/v1/community/posts', { body: 'Hi', turnstileToken: 'bad' })).status,
    ).toBe(400);
    expect(
      (await call('a', 'POST', '/api/v1/community/posts', { body: 'Hi', turnstileToken: 'good' })).status,
    ).toBe(201);
    expect(seen).toEqual(['bad', 'good']);
  });

  it('shows posts from the same area, and blocks work both ways', async () => {
    const { call, profile } = await setup();
    await profile('a');
    await profile('b', NEXT_DOOR);
    await profile('far', SYDNEY, 'AU');
    await call('a', 'POST', '/api/v1/community/posts', { body: 'From A' });
    await call('b', 'POST', '/api/v1/community/posts', { body: 'From B' });
    await call('far', 'POST', '/api/v1/community/posts', { body: 'From Sydney' });
    const feed = async (u: string) =>
      ((await call(u, 'GET', '/api/v1/community/feed')).body!.posts as Array<{ body: string }>).map(
        (p) => p.body,
      );
    expect((await feed('a')).sort()).toEqual(['From A', 'From B']);
    expect(await feed('far')).toEqual(['From Sydney']);
    await call('a', 'POST', '/api/v1/community/blocks', { userId: 'b' });
    expect(await feed('a')).toEqual(['From A']);
    expect(await feed('b')).toEqual(['From B']);
    await call('a', 'DELETE', '/api/v1/community/blocks/b');
    expect((await feed('b')).sort()).toEqual(['From A', 'From B']);
  });
});

describe('events', () => {
  it('takes RSVPs up to the capacity and lets the organiser cancel', async () => {
    const { call, profile } = await setup();
    for (const u of ['org', 'a', 'b']) await profile(u);
    const ev = await call('org', 'POST', '/api/v1/community/events', {
      title: 'Seed swap',
      body: 'Bring labelled envelopes',
      place: 'Community garden gate',
      startsAt: T0 + 2 * DAY,
      endsAt: T0 + 2 * DAY + 2 * HOUR,
      capacity: 1,
    });
    expect(ev.status).toBe(201);
    const id = ev.body!.id as string;
    expect((await call('a', 'PUT', `/api/v1/community/events/${id}/rsvp`, { status: 'going' })).status).toBe(
      200,
    );
    expect((await call('b', 'PUT', `/api/v1/community/events/${id}/rsvp`, { status: 'going' })).status).toBe(
      409,
    );
    const maybe = await call('b', 'PUT', `/api/v1/community/events/${id}/rsvp`, { status: 'maybe' });
    expect(maybe.body!.event).toMatchObject({ going: 1, maybe: 1, mine: 'maybe' });
    expect((await call('a', 'POST', `/api/v1/community/events/${id}/cancel`)).status).toBe(404);
    expect((await call('org', 'POST', `/api/v1/community/events/${id}/cancel`)).status).toBe(200);
    expect((await call('b', 'PUT', `/api/v1/community/events/${id}/rsvp`, { status: 'going' })).status).toBe(
      409,
    );
  });
});

describe('Seed & Cutting Exchange', () => {
  async function offered() {
    const s = await setup();
    for (const u of ['owner', 'r1', 'r2']) await s.profile(u);
    const created = await s.call('owner', 'POST', '/api/v1/community/exchange', listing());
    expect(created.body).toMatchObject({ state: 'listed' });
    return { ...s, id: created.body!.id as string };
  }
  const act = (s: Awaited<ReturnType<typeof offered>>, user: string, action: string) =>
    s.call(user, 'POST', `/api/v1/community/exchange/${s.id}/${action}`);

  it('refuses species listed invasive in the person’s country', async () => {
    const { call, profile } = await setup();
    await profile('in', PUNE, 'IN');
    await profile('gb', PUNE, 'GB');
    const lantana = listing({
      title: 'Lantana cuttings',
      kind: 'cuttings',
      scientificName: 'Lantana camara',
    });
    const refused = await call('in', 'POST', '/api/v1/community/exchange', lantana);
    expect(refused.status).toBe(400);
    expect(refused.body!.detail).toMatch(/listed invasive in IN/);
    // Unknown elsewhere is not "not invasive", but there is no listing to block on.
    expect((await call('gb', 'POST', '/api/v1/community/exchange', lantana)).status).toBe(201);
    // A draft can be saved, but not published.
    const draft = await call('in', 'POST', '/api/v1/community/exchange', { ...lantana, publish: false });
    expect(draft.body).toMatchObject({ state: 'draft' });
    expect((await call('in', 'POST', `/api/v1/community/exchange/${draft.body!.id}/publish`)).status).toBe(
      400,
    );
  });

  it('goes listed → reserved → handoff confirmed by both → completed, revealing contacts only by mutual consent', async () => {
    const s = await offered();
    expect((await act(s, 'owner', 'reserve')).status).toBe(403);
    const r = await act(s, 'r1', 'reserve');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ role: 'requester', listing: { state: 'reserved' } });
    expect((await act(s, 'r2', 'reserve')).status).toBe(409);

    await s.call('r1', 'PUT', `/api/v1/community/exchange/${s.id}/contact`, { contact: 'r1@example.org' });
    let view = await s.call('owner', 'GET', `/api/v1/community/exchange/${s.id}`);
    expect(view.body!.reservation.contacts).toBeNull();
    await s.call('owner', 'PUT', `/api/v1/community/exchange/${s.id}/contact`, {
      contact: 'Ring the bell at 4B',
    });
    view = await s.call('r1', 'GET', `/api/v1/community/exchange/${s.id}`);
    expect(view.body!.reservation.contacts).toEqual({
      owner: 'Ring the bell at 4B',
      requester: 'r1@example.org',
    });
    const outsider = await s.call('r2', 'GET', `/api/v1/community/exchange/${s.id}`);
    expect(outsider.body!.reservation).toBeNull();
    expect(
      (await s.call('r2', 'PUT', `/api/v1/community/exchange/${s.id}/contact`, { contact: 'x' })).status,
    ).toBe(403);

    expect((await act(s, 'owner', 'confirm')).body!.listing.state).toBe('reserved');
    expect((await act(s, 'r2', 'confirm')).status).toBe(403);
    expect((await act(s, 'r1', 'confirm')).body!.listing.state).toBe('handoff_confirmed');
    expect((await act(s, 'r1', 'complete')).body!.listing.state).toBe('completed');
    expect((await act(s, 'r2', 'reserve')).status).toBe(409);
  });

  it('puts the listing back on offer when the owner releases, the requester cancels, or 48 hours pass', async () => {
    const s = await offered();
    await act(s, 'r1', 'reserve');
    expect((await act(s, 'r1', 'release')).status).toBe(403);
    expect((await act(s, 'owner', 'release')).body!.listing.state).toBe('listed');
    await act(s, 'r2', 'reserve');
    expect((await act(s, 'r1', 'cancel')).status).toBe(403);
    expect((await act(s, 'r2', 'cancel')).body!.listing.state).toBe('listed');
    await act(s, 'r1', 'reserve');
    s.advance(49 * HOUR);
    expect((await s.call('r2', 'GET', `/api/v1/community/exchange/${s.id}`)).body!.listing.state).toBe(
      'listed',
    );
    expect((await act(s, 'r2', 'reserve')).status).toBe(200);
    const rows = await s.d1
      .prepare('SELECT state FROM exchange_reservations ORDER BY created_at')
      .all<{ state: string }>();
    expect(rows.results.map((r) => r.state)).toEqual(['released', 'cancelled', 'expired', 'active']);
  });

  it('expires listings after 30 days and withdraws on request', async () => {
    const s = await offered();
    s.advance(31 * DAY);
    const list = await s.call('r1', 'GET', '/api/v1/community/exchange');
    expect(list.body!.listings).toEqual([]);
    expect((await act(s, 'r1', 'reserve')).status).toBe(409);
    const again = await s.call('owner', 'POST', '/api/v1/community/exchange', listing());
    expect(
      (await s.call('owner', 'POST', `/api/v1/community/exchange/${again.body!.id}/withdraw`)).body!.listing
        .state,
    ).toBe('withdrawn');
  });

  it('has exactly one winner when ten people reserve at the same moment', async () => {
    const s = await setup();
    await s.profile('owner');
    const people = Array.from({ length: 10 }, (_, i) => `p${i}`);
    for (const p of people) await s.profile(p);
    const id = (await s.call('owner', 'POST', '/api/v1/community/exchange', listing())).body!.id as string;
    const results = await Promise.all(
      people.map((p) => s.call(p, 'POST', `/api/v1/community/exchange/${id}/reserve`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    const active = await s.d1
      .prepare(`SELECT COUNT(*) AS n FROM exchange_reservations WHERE listing_id = ? AND state = 'active'`)
      .bind(id)
      .first('n');
    expect(active).toBe(1);
  });

  it('keeps blocked people apart and runs a public Q&A', async () => {
    const s = await offered();
    await s.call('owner', 'POST', '/api/v1/community/blocks', { userId: 'r2' });
    expect((await act(s, 'r2', 'reserve')).status).toBe(404);
    const q = await s.call('r1', 'POST', `/api/v1/community/exchange/${s.id}/questions`, {
      body: 'Organic?',
    });
    expect(q.status).toBe(201);
    await s.call('owner', 'POST', `/api/v1/community/exchange/${s.id}/questions`, {
      body: 'Yes, never sprayed',
      parentId: q.body!.id,
    });
    const view = await s.call('r1', 'GET', `/api/v1/community/exchange/${s.id}`);
    expect(
      (view.body!.questions as Array<{ body: string; parentId: string | null }>).map((x) => [
        x.body,
        x.parentId,
      ]),
    ).toEqual([
      ['Organic?', null],
      ['Yes, never sprayed', q.body!.id],
    ]);
  });
});

describe('moderation', () => {
  async function reported() {
    const s = await setup();
    for (const u of ['author', 'x', 'y', 'z', 'mod', 'admin']) await s.profile(u);
    await s.store.setStaff('mod', 'moderator', T0);
    await s.store.setStaff('admin', 'admin', T0);
    const post = (await s.call('author', 'POST', '/api/v1/community/posts', { body: 'Buy cheap pills' }))
      .body!.id as string;
    return { ...s, post };
  }
  const feedOf = async (s: Awaited<ReturnType<typeof reported>>, u: string) =>
    (await s.call(u, 'GET', '/api/v1/community/feed')).body!.posts as Array<{
      id: string;
      visibility: string;
    }>;

  it('hides an item after three independent reports, pending review', async () => {
    const s = await reported();
    const report = (u: string) =>
      s.call(u, 'POST', '/api/v1/community/reports', { type: 'post', id: s.post, reason: 'spam' });
    expect(
      (
        await s.call('author', 'POST', '/api/v1/community/reports', {
          type: 'post',
          id: s.post,
          reason: 'spam',
        })
      ).status,
    ).toBe(400);
    await report('x');
    await report('x');
    await report('y');
    expect(await feedOf(s, 'z')).toHaveLength(1);
    await report('z');
    expect(await feedOf(s, 'x')).toHaveLength(0);
    // The author still sees it, marked hidden.
    expect(await feedOf(s, 'author')).toEqual([
      expect.objectContaining({ id: s.post, visibility: 'hidden' }),
    ]);
  });

  it('only staff reach the queue; actions are audited; appeals can overturn them', async () => {
    const s = await reported();
    for (const u of ['x', 'y', 'z'])
      await s.call(u, 'POST', '/api/v1/community/reports', { type: 'post', id: s.post, reason: 'spam' });
    for (const path of ['/api/v1/admin/queue', '/api/v1/admin/audit'])
      expect((await s.call('x', 'GET', path)).status).toBe(403);
    const queue = await s.call('mod', 'GET', '/api/v1/admin/queue');
    expect(queue.body!.items).toEqual([
      expect.objectContaining({
        type: 'post',
        id: s.post,
        reports: 3,
        reasons: 'spam',
        visibility: 'hidden',
      }),
    ]);

    const removed = await s.call('mod', 'POST', '/api/v1/admin/actions', {
      action: 'remove',
      targetType: 'post',
      targetId: s.post,
      reason: 'Spam',
    });
    expect(removed.status).toBe(201);
    expect((await s.call('mod', 'GET', '/api/v1/admin/queue')).body!.items).toEqual([]);
    const notices = (await s.call('author', 'GET', '/api/v1/community/profile')).body!.notices;
    expect(notices).toEqual([expect.objectContaining({ action: 'remove', targetId: s.post, appeal: null })]);

    const appeal = await s.call('author', 'POST', '/api/v1/community/appeals', {
      actionId: removed.body!.id,
      body: 'It was a joke about seed prices',
    });
    expect(appeal.status).toBe(201);
    expect(
      (
        await s.call('author', 'POST', '/api/v1/community/appeals', {
          actionId: removed.body!.id,
          body: 'Again',
        })
      ).status,
    ).toBe(409);
    expect(
      (await s.call('x', 'POST', '/api/v1/community/appeals', { actionId: removed.body!.id, body: 'Me too' }))
        .status,
    ).toBe(404);
    const open = (await s.call('mod', 'GET', '/api/v1/admin/queue')).body!.appeals;
    expect(open).toEqual([expect.objectContaining({ action: 'remove', userId: 'author' })]);
    await s.call('mod', 'POST', `/api/v1/admin/appeals/${appeal.body!.id}`, { decision: 'overturned' });
    expect(await feedOf(s, 'x')).toEqual([expect.objectContaining({ id: s.post, visibility: 'visible' })]);
    const audit = (await s.call('mod', 'GET', '/api/v1/admin/audit')).body!.actions as Array<{
      action: string;
    }>;
    expect(audit.map((a) => a.action)).toEqual(['restore', 'remove']);
  });

  it('suspends and bans; only admins grant staff roles', async () => {
    const s = await reported();
    await s.call('mod', 'POST', '/api/v1/admin/actions', {
      action: 'suspend',
      targetType: 'user',
      targetId: 'author',
      reason: 'Repeated spam',
      days: 7,
    });
    expect((await s.call('author', 'POST', '/api/v1/community/posts', { body: 'Hi' })).status).toBe(403);
    s.advance(8 * DAY);
    expect((await s.call('author', 'POST', '/api/v1/community/posts', { body: 'Back' })).status).toBe(201);

    await s.call('mod', 'POST', '/api/v1/admin/actions', {
      action: 'ban',
      targetType: 'user',
      targetId: 'author',
      reason: 'Spam ring',
    });
    expect((await s.call('author', 'POST', '/api/v1/community/posts', { body: 'Hi' })).status).toBe(403);
    expect(await feedOf(s, 'x')).toEqual([]);
    expect(
      (
        await s.call('mod', 'POST', '/api/v1/admin/actions', {
          action: 'hide',
          targetType: 'user',
          targetId: 'x',
          reason: 'x',
        })
      ).status,
    ).toBe(400);

    expect(
      (await s.call('mod', 'PUT', '/api/v1/admin/staff', { userId: 'x', role: 'moderator' })).status,
    ).toBe(403);
    expect(
      (await s.call('admin', 'PUT', '/api/v1/admin/staff', { userId: 'x', role: 'moderator' })).status,
    ).toBe(200);
    expect((await s.call('x', 'GET', '/api/v1/admin/queue')).status).toBe(200);
  });
});

describe('community map privacy (§19)', () => {
  it('shows only cells with at least five recent contributors, and nothing about who', async () => {
    const s = await setup();
    const inPune = ['a', 'b', 'c', 'd'];
    for (const u of inPune) {
      await s.profile(u);
      await s.call(u, 'POST', '/api/v1/community/posts', { body: `Hi from ${u}` });
    }
    // Someone with a profile but nothing shared does not count.
    await s.profile('lurker');
    const cells = async () => (await s.call('a', 'GET', '/api/v1/community/map')).body!;
    expect((await cells()).cells).toEqual([]);
    await s.profile('e');
    await s.call('e', 'POST', '/api/v1/community/posts', { body: 'Hi from e' });
    const map = await cells();
    expect(map).toEqual({ area: PUNE_AREA, cells: [{ cell: PUNE, contributors: 5 }] });
    expect(JSON.stringify(map)).not.toMatch(/"a"|"e"|lurker|Hi from/);
    // Activity older than 90 days stops counting.
    s.advance(91 * DAY);
    expect((await cells()).cells).toEqual([]);
  });
});
