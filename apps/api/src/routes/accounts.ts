import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { localDateOf, newId } from '@plantpal/domain';
import { type CARE_KINDS, Id, Problem } from '@plantpal/schemas';
import {
  applyOp,
  applyPush,
  canManage,
  canRead,
  PullResponse,
  PushRequest,
  PushResponse,
  ROLES,
  SnapshotResponse,
  SyncAccessError,
  pullChanges,
  snapshot,
  type Role,
  type SyncRepo,
} from '@plantpal/sync';
import { type AccountsStore, newToken, tokenHash, type SitterLink } from '../lib/accounts';
import { problem } from '../lib/problem';
import type { Rooms } from '../lib/rooms';
import type { RateLimiter } from '../lib/rate-limit';

/** Resolves the signed-in person from the request (Better Auth session in the Worker). */
export interface Authenticator {
  /** `createdAt` (epoch ms) lets community rules require a minimum account age. */
  userOf(req: Request): Promise<{ id: string; name: string; createdAt?: number } | null>;
}

export interface AccountsDeps {
  accounts: AccountsStore;
  sync: SyncRepo;
  auth: Authenticator;
  limiter: RateLimiter;
  /** Live change pings; absent where realtime is off (tests, plain Node). */
  rooms?: Rooms;
  now?: () => number;
}

type Vars = { Variables: { traceId: string } };
type C = Context<Vars>;

const problems = (...codes: Array<400 | 401 | 403 | 404 | 409 | 410 | 429>) =>
  Object.fromEntries(
    codes.map((s) => [
      s,
      { description: 'Problem', content: { 'application/problem+json': { schema: Problem } } },
    ]),
  );
const json = <S extends z.ZodType>(schema: S, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});
const body = <S extends z.ZodType>(schema: S) => ({
  content: { 'application/json': { schema } },
  required: true,
});

const WorkspaceRef = z.object({ id: Id, name: z.string(), role: z.enum(ROLES) });
const Me = z.object({
  user: z.object({ id: z.string(), name: z.string() }),
  workspaces: z.array(WorkspaceRef),
});
const MemberOut = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  role: z.enum(ROLES),
  createdAt: z.number(),
});
const ShareLinkOut = z.object({
  id: z.string(),
  gardenId: z.string(),
  label: z.string(),
  zoneIds: z.array(z.string()),
  startsAt: z.number(),
  expiresAt: z.number(),
  revokedAt: z.number().nullable(),
});
const WsParam = z.object({ id: Id });
const MAX_LINK_DAYS = 30;
const SITTER_KINDS = ['water', 'feed', 'pest-check', 'other'] as const satisfies ReadonlyArray<
  (typeof CARE_KINDS)[number]
>;

const meRoute = createRoute({
  method: 'get',
  path: '/api/v1/me',
  summary: 'The signed-in person and their workspaces',
  tags: ['accounts'],
  responses: { 200: json(Me), ...problems(401) },
});
const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/api/v1/workspaces',
  summary: 'Create a shared workspace, or claim a guest workspace from this device',
  tags: ['accounts'],
  request: { body: body(z.object({ id: Id, name: z.string().trim().min(1).max(120) })) },
  responses: { 201: json(WorkspaceRef, 'Created'), 200: json(WorkspaceRef), ...problems(400, 401, 403) },
});
const pushRoute = createRoute({
  method: 'post',
  path: '/api/v1/sync/push',
  summary: 'Apply queued changes (≤ 100); each op is authorised, validated and idempotent',
  tags: ['sync'],
  request: { body: body(PushRequest) },
  responses: { 200: json(PushResponse), ...problems(400, 401, 429) },
});
const pullRoute = createRoute({
  method: 'get',
  path: '/api/v1/sync/pull',
  summary: 'Changes since a cursor, tombstones included',
  tags: ['sync'],
  request: {
    query: z.object({
      workspace: Id,
      cursor: z.coerce.number().int().nonnegative().default(0),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }),
  },
  responses: { 200: json(PullResponse), ...problems(400, 401, 403, 409) },
});
const snapshotRoute = createRoute({
  method: 'get',
  path: '/api/v1/sync/snapshot',
  summary: 'Every live record of a workspace, with the cursor to continue from',
  tags: ['sync'],
  request: { query: z.object({ workspace: Id }) },
  responses: { 200: json(SnapshotResponse), ...problems(400, 401, 403) },
});
const membersRoute = createRoute({
  method: 'get',
  path: '/api/v1/workspaces/{id}/members',
  summary: 'Members and roles',
  tags: ['sharing'],
  request: { params: WsParam },
  responses: { 200: json(z.object({ members: z.array(MemberOut) })), ...problems(401, 403) },
});
const setRoleRoute = createRoute({
  method: 'patch',
  path: '/api/v1/workspaces/{id}/members/{userId}',
  summary: 'Change a member’s role (owners only; a garden keeps at least one owner)',
  tags: ['sharing'],
  request: {
    params: z.object({ id: Id, userId: z.string().min(1).max(100) }),
    body: body(z.object({ role: z.enum(ROLES) })),
  },
  responses: { 200: json(MemberOut), ...problems(400, 401, 403, 404) },
});
const removeMemberRoute = createRoute({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/members/{userId}',
  summary: 'Remove a member (owners), or leave (yourself). Their records stay with the garden.',
  tags: ['sharing'],
  request: { params: z.object({ id: Id, userId: z.string().min(1).max(100) }) },
  responses: { 204: { description: 'Removed' }, ...problems(400, 401, 403, 404) },
});
const inviteRoute = createRoute({
  method: 'post',
  path: '/api/v1/workspaces/{id}/invitations',
  summary: 'Create a single-use, expiring invitation link (owners only). The token is shown once.',
  tags: ['sharing'],
  request: {
    params: WsParam,
    body: body(
      z.object({
        role: z.enum(['gardener', 'helper', 'viewer']),
        ttlHours: z.number().int().min(1).max(168).default(72),
      }),
    ),
  },
  responses: {
    201: json(z.object({ token: z.string(), expiresAt: z.number(), role: z.string() }), 'Created'),
    ...problems(400, 401, 403),
  },
});
const acceptRoute = createRoute({
  method: 'post',
  path: '/api/v1/invitations/accept',
  summary: 'Accept an invitation',
  tags: ['sharing'],
  request: { body: body(z.object({ token: z.string().min(20).max(100) })) },
  responses: {
    200: json(z.object({ workspaceId: z.string(), role: z.enum(ROLES) })),
    ...problems(400, 401, 404, 410),
  },
});
const createLinkRoute = createRoute({
  method: 'post',
  path: '/api/v1/workspaces/{id}/share-links',
  summary: 'Create a plant-sitter link for some spaces and dates (owners only). The token is shown once.',
  tags: ['sharing'],
  request: {
    params: WsParam,
    body: body(
      z.object({
        gardenId: Id,
        zoneIds: z.array(Id).min(1).max(20),
        label: z.string().trim().min(1).max(80),
        startsAt: z.number().int().nonnegative(),
        expiresAt: z.number().int().positive(),
      }),
    ),
  },
  responses: {
    201: json(ShareLinkOut.extend({ token: z.string() }), 'Created'),
    ...problems(400, 401, 403, 404),
  },
});
const listLinksRoute = createRoute({
  method: 'get',
  path: '/api/v1/workspaces/{id}/share-links',
  summary: 'Plant-sitter links (owners only); tokens are never shown again',
  tags: ['sharing'],
  request: { params: WsParam },
  responses: { 200: json(z.object({ links: z.array(ShareLinkOut) })), ...problems(401, 403) },
});
const revokeLinkRoute = createRoute({
  method: 'delete',
  path: '/api/v1/workspaces/{id}/share-links/{linkId}',
  summary: 'Revoke a plant-sitter link now',
  tags: ['sharing'],
  request: { params: z.object({ id: Id, linkId: Id }) },
  responses: { 204: { description: 'Revoked' }, ...problems(401, 403) },
});
const linkSummaryRoute = createRoute({
  method: 'get',
  path: '/api/v1/workspaces/{id}/share-links/{linkId}/summary',
  summary: 'What the plant sitter logged (owners only)',
  tags: ['sharing'],
  request: { params: z.object({ id: Id, linkId: Id }) },
  responses: { 200: json(z.object({ care: z.array(z.unknown()) })), ...problems(401, 403, 404) },
});
const SitterView = z.object({
  label: z.string(),
  garden: z.object({ name: z.string(), timezone: z.string() }),
  startsAt: z.number(),
  expiresAt: z.number(),
  plants: z.array(z.object({ id: z.string(), name: z.string(), zone: z.string() })),
  care: z.array(
    z.object({
      specimenId: z.string().nullable(),
      kind: z.string(),
      occurredAt: z.number(),
      amountMl: z.number().nullable(),
    }),
  ),
});
const sitterViewRoute = createRoute({
  method: 'get',
  path: '/api/v1/share/{token}',
  summary: 'Plant-sitter checklist (no account; scoped, expiring link)',
  tags: ['sharing'],
  request: { params: z.object({ token: z.string().min(20).max(100) }) },
  responses: { 200: json(SitterView), ...problems(404, 410, 429) },
});
const sitterCareRoute = createRoute({
  method: 'post',
  path: '/api/v1/share/{token}/care',
  summary: 'Log care as the plant sitter (only for plants in the link’s spaces)',
  tags: ['sharing'],
  request: {
    params: z.object({ token: z.string().min(20).max(100) }),
    body: body(
      z.object({
        specimenId: Id,
        kind: z.enum(SITTER_KINDS),
        amountMl: z.number().int().min(0).max(100_000).nullable().default(null),
        notes: z.string().max(500).default(''),
      }),
    ),
  },
  responses: { 201: json(z.object({ id: z.string() }), 'Logged'), ...problems(400, 403, 404, 410, 429) },
});

const clean = (l: SitterLink) => ({
  id: l.id,
  gardenId: l.gardenId,
  label: l.label,
  zoneIds: l.zoneIds,
  startsAt: l.startsAt,
  expiresAt: l.expiresAt,
  revokedAt: l.revokedAt,
});

/** Accounts, sync and sharing routes (§14.2). Authorisation runs on every request. */
export function registerAccountRoutes(app: OpenAPIHono<Vars>, deps: AccountsDeps) {
  const now = () => deps.now?.() ?? Date.now();

  const userOr401 = async (c: C) => {
    const u = await deps.auth.userOf(c.req.raw);
    return u ?? null;
  };
  const unauth = (c: C) => problem(c, 401, 'UNAUTHENTICATED');
  const forbid = (c: C, detail?: string) => problem(c, 403, 'FORBIDDEN', detail);
  const limited = async (c: C, key: string) => {
    const r = await deps.limiter.take(key);
    if (r.allowed) return null;
    return problem(c, 429, 'RATE_LIMITED', 'Slow down a little', {
      retryAfterSeconds: Math.ceil(r.retryAfterMs / 1000),
    });
  };
  const roleIn = (userId: string) => (workspaceId: string) => deps.accounts.roleOf(workspaceId, userId);
  /** Realtime is best effort: a failed ping never fails the write (members also poll). */
  const ping = async (workspaceId: string) => {
    if (!deps.rooms) return;
    try {
      await deps.rooms.changed(workspaceId, await deps.sync.latestSeq(workspaceId));
    } catch {
      /* members still pull on focus and every minute */
    }
  };

  app.openapi(meRoute, async (c) => {
    const u = await userOr401(c);
    if (!u) return unauth(c) as never;
    return c.json(
      { user: { id: u.id, name: u.name }, workspaces: await deps.accounts.workspacesOf(u.id) },
      200,
    );
  });

  app.openapi(createWorkspaceRoute, async (c) => {
    const u = await userOr401(c);
    if (!u) return unauth(c) as never;
    const { id, name } = c.req.valid('json');
    const existing = await deps.accounts.getWorkspace(id);
    if (existing) {
      const role = await deps.accounts.roleOf(id, u.id);
      if (role !== 'owner') return forbid(c, 'This workspace already exists') as never;
      return c.json({ id, name: existing.name, role }, 200);
    }
    await deps.accounts.createWorkspace(id, name, u.id, now());
    return c.json({ id, name, role: 'owner' as const }, 201);
  });

  app.openapi(pushRoute, async (c) => {
    const u = await userOr401(c);
    if (!u) return unauth(c) as never;
    const slow = await limited(c, `user:${u.id}`);
    if (slow) return slow as never;
    const { ops } = c.req.valid('json');
    const results = await applyPush(deps.sync, roleIn(u.id), u.id, ops, now());
    const touched = new Set(ops.filter((_, i) => results[i]?.status === 'applied').map((o) => o.workspaceId));
    for (const ws of touched) await ping(ws);
    return c.json({ results }, 200);
  });

  const readGuard = async (c: C, workspaceId: string) => {
    const u = await userOr401(c);
    if (!u) return { error: unauth(c) };
    const role = await deps.accounts.roleOf(workspaceId, u.id);
    if (!canRead(role)) return { error: forbid(c) };
    return { role };
  };

  app.openapi(pullRoute, async (c) => {
    const { workspace, cursor, limit } = c.req.valid('query');
    const g = await readGuard(c, workspace);
    if ('error' in g) return g.error as never;
    try {
      return c.json(await pullChanges(deps.sync, g.role as Role, workspace, cursor, limit), 200);
    } catch (e) {
      if (e instanceof SyncAccessError && e.code === 'SNAPSHOT_REQUIRED')
        return problem(
          c,
          409,
          'SNAPSHOT_REQUIRED',
          'This device has been away too long; fetch a snapshot',
        ) as never;
      throw e;
    }
  });

  app.openapi(snapshotRoute, async (c) => {
    const { workspace } = c.req.valid('query');
    const g = await readGuard(c, workspace);
    if ('error' in g) return g.error as never;
    return c.json(await snapshot(deps.sync, g.role as Role, workspace), 200);
  });

  app.openapi(membersRoute, async (c) => {
    const { id } = c.req.valid('param');
    const g = await readGuard(c, id);
    if ('error' in g) return g.error as never;
    return c.json({ members: await deps.accounts.members(id) }, 200);
  });

  const ownerGuard = async (c: C, workspaceId: string) => {
    const u = await userOr401(c);
    if (!u) return { error: unauth(c) };
    const role = await deps.accounts.roleOf(workspaceId, u.id);
    if (!canManage(role)) return { error: forbid(c, 'Only an owner can do this') };
    return { user: u };
  };

  app.openapi(setRoleRoute, async (c) => {
    const { id, userId } = c.req.valid('param');
    const { role } = c.req.valid('json');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    const current = await deps.accounts.roleOf(id, userId);
    if (!current) return problem(c, 404, 'NOT_FOUND') as never;
    if (current === 'owner' && role !== 'owner' && (await deps.accounts.owners(id)) <= 1)
      return problem(c, 400, 'VALIDATION_FAILED', 'A garden needs at least one owner') as never;
    await deps.accounts.setRole(id, userId, role);
    const m = (await deps.accounts.members(id)).find((x) => x.userId === userId)!;
    return c.json(m, 200);
  });

  app.openapi(removeMemberRoute, async (c) => {
    const { id, userId } = c.req.valid('param');
    const u = await userOr401(c);
    if (!u) return unauth(c) as never;
    const mine = await deps.accounts.roleOf(id, u.id);
    if (!mine) return forbid(c) as never;
    if (u.id !== userId && !canManage(mine)) return forbid(c, 'Only an owner can remove someone') as never;
    const theirs = await deps.accounts.roleOf(id, userId);
    if (!theirs) return problem(c, 404, 'NOT_FOUND') as never;
    if (theirs === 'owner' && (await deps.accounts.owners(id)) <= 1)
      return problem(c, 400, 'VALIDATION_FAILED', 'A garden needs at least one owner') as never;
    await deps.accounts.removeMember(id, userId);
    await deps.rooms?.kick(id, userId).catch(() => undefined);
    return c.body(null, 204);
  });

  app.openapi(inviteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { role, ttlHours } = c.req.valid('json');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    const token = newToken();
    const expiresAt = now() + ttlHours * 3_600_000;
    await deps.accounts.createInvitation({
      id: newId(now()),
      workspaceId: id,
      role,
      tokenHash: await tokenHash(token),
      expiresAt,
      createdBy: g.user.id,
      now: now(),
    });
    return c.json({ token, expiresAt, role }, 201);
  });

  app.openapi(acceptRoute, async (c) => {
    const u = await userOr401(c);
    if (!u) return unauth(c) as never;
    const { token } = c.req.valid('json');
    const r = await deps.accounts.acceptInvitation(await tokenHash(token), u.id, now());
    if (!r.ok)
      return (
        r.reason === 'NOT_FOUND'
          ? problem(c, 404, 'NOT_FOUND', 'This invitation does not exist')
          : problem(
              c,
              410,
              'FORBIDDEN',
              r.reason === 'USED' ? 'This invitation was already used' : 'This invitation has expired',
            )
      ) as never;
    return c.json({ workspaceId: r.workspaceId, role: r.role }, 200);
  });

  app.openapi(createLinkRoute, async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    if (input.expiresAt <= input.startsAt || input.expiresAt - input.startsAt > MAX_LINK_DAYS * 86_400_000)
      return problem(c, 400, 'VALIDATION_FAILED', `A link lasts at most ${MAX_LINK_DAYS} days`) as never;
    // Every id in the scope must belong to this workspace (§14.1).
    const garden = await deps.sync.getRecord('garden', input.gardenId);
    if (!garden || garden.workspaceId !== id || garden.deletedAt !== null)
      return problem(c, 404, 'NOT_FOUND') as never;
    for (const z of input.zoneIds) {
      const zone = await deps.sync.getRecord('zone', z);
      if (!zone || zone.workspaceId !== id || zone.record.gardenId !== input.gardenId)
        return problem(c, 404, 'NOT_FOUND', 'A space in the link is not in this garden') as never;
    }
    const token = newToken();
    const link: SitterLink = { id: newId(now()), workspaceId: id, revokedAt: null, ...input };
    await deps.accounts.createShareLink({
      ...link,
      tokenHash: await tokenHash(token),
      createdBy: g.user.id,
      now: now(),
    });
    return c.json({ ...clean(link), token }, 201);
  });

  app.openapi(listLinksRoute, async (c) => {
    const { id } = c.req.valid('param');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    return c.json({ links: (await deps.accounts.shareLinks(id)).map(clean) }, 200);
  });

  app.openapi(revokeLinkRoute, async (c) => {
    const { id, linkId } = c.req.valid('param');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    await deps.accounts.revokeShareLink(id, linkId, now());
    return c.body(null, 204);
  });

  app.openapi(linkSummaryRoute, async (c) => {
    const { id, linkId } = c.req.valid('param');
    const g = await ownerGuard(c, id);
    if ('error' in g) return g.error as never;
    if (!(await deps.accounts.shareLinks(id)).some((l) => l.id === linkId))
      return problem(c, 404, 'NOT_FOUND') as never;
    const touched = await deps.sync.appliedBy(`sitter:${linkId}`);
    const care = [];
    for (const t of touched) {
      const r = await deps.sync.getRecord('careEvent', t.entityId);
      if (r && r.workspaceId === id) care.push(r.record);
    }
    return c.json({ care }, 200);
  });

  /** A sitter link is usable only between its start and end, and until revoked. */
  const sitterLink = async (c: C, token: string) => {
    const slow = await limited(c, `share:${(await tokenHash(token)).slice(0, 24)}`);
    if (slow) return { error: slow };
    const link = await deps.accounts.shareLinkByHash(await tokenHash(token));
    if (!link) return { error: problem(c, 404, 'NOT_FOUND', 'This link does not exist') };
    const t = now();
    if (link.revokedAt !== null)
      return { error: problem(c, 410, 'FORBIDDEN', 'This link was turned off by the owner') };
    if (t < link.startsAt || t >= link.expiresAt)
      return { error: problem(c, 410, 'FORBIDDEN', 'This link is not active right now') };
    return { link };
  };

  const scope = async (link: SitterLink) => {
    const all = await deps.sync.liveRecords(link.workspaceId);
    const zones = new Map(
      all
        .filter((r) => r.entity === 'zone' && link.zoneIds.includes(r.id))
        .map((r) => [r.id, String(r.record.name ?? '')]),
    );
    const plants = all.filter(
      (r) =>
        r.entity === 'specimen' &&
        r.record.gardenId === link.gardenId &&
        zones.has(String(r.record.zoneId)) &&
        (r.record.status === 'active' || r.record.status === 'dormant'),
    );
    const garden = all.find((r) => r.entity === 'garden' && r.id === link.gardenId);
    return { all, zones, plants, garden };
  };

  app.openapi(sitterViewRoute, async (c) => {
    const { token } = c.req.valid('param');
    const g = await sitterLink(c, token);
    if ('error' in g) return g.error as never;
    const { all, zones, plants, garden } = await scope(g.link);
    const ids = new Set(plants.map((p) => p.id));
    const care = all
      .filter(
        (r) =>
          r.entity === 'careEvent' &&
          ids.has(String(r.record.specimenId)) &&
          Number(r.record.occurredAt) >= g.link.startsAt,
      )
      .map((r) => ({
        specimenId: (r.record.specimenId as string | null) ?? null,
        kind: String(r.record.kind),
        occurredAt: Number(r.record.occurredAt),
        amountMl: (r.record.amountMl as number | null) ?? null,
      }))
      .sort((a, b) => b.occurredAt - a.occurredAt);
    return c.json(
      {
        label: g.link.label,
        garden: {
          name: String(garden?.record.name ?? ''),
          timezone: String(garden?.record.timezone ?? 'UTC'),
        },
        startsAt: g.link.startsAt,
        expiresAt: g.link.expiresAt,
        plants: plants.map((p) => ({
          id: p.id,
          name: String(p.record.displayName),
          zone: zones.get(String(p.record.zoneId)) ?? '',
        })),
        care,
      },
      200,
    );
  });

  app.openapi(sitterCareRoute, async (c) => {
    const { token } = c.req.valid('param');
    const input = c.req.valid('json');
    const g = await sitterLink(c, token);
    if ('error' in g) return g.error as never;
    const { plants, garden } = await scope(g.link);
    if (!plants.some((p) => p.id === input.specimenId))
      return problem(c, 403, 'FORBIDDEN', 'That plant is not part of this link') as never;
    const t = now();
    const id = newId(t);
    const record = {
      id,
      opId: newId(t),
      workspaceId: g.link.workspaceId,
      gardenId: g.link.gardenId,
      createdAt: t,
      deletedAt: null,
      occurredAt: t,
      occurredOn: localDateOf(t, String(garden?.record.timezone ?? 'UTC')),
      dateUncertain: false,
      specimenId: input.specimenId,
      kind: input.kind,
      amountMl: input.kind === 'water' ? input.amountMl : null,
      waterSource: null,
      occurrenceKey: null,
      notes: input.notes
        ? `Plant sitter (${g.link.label}): ${input.notes}`
        : `Plant sitter (${g.link.label})`,
      mediaIds: [],
      source: null,
    };
    // Same path as every other write: validated, referenced ids checked, logged in the change feed.
    const r = await applyOp(
      deps.sync,
      { id: `sitter:${g.link.id}`, role: 'helper' },
      {
        opId: record.opId,
        workspaceId: g.link.workspaceId,
        type: 'careEvent.create',
        entityId: id,
        payload: record,
        baseVersion: null,
        createdAt: t,
        clientSchema: 7,
        state: 'pending',
      },
      t,
    );
    if (r.status !== 'applied') return problem(c, 400, 'VALIDATION_FAILED', r.message ?? undefined) as never;
    await ping(g.link.workspaceId);
    return c.json({ id }, 201);
  });
}
