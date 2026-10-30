import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { SEED_PACK } from '@plantpal/catalog';
import { nativeStatusOf } from '@plantpal/domain';
import { Id, Problem } from '@plantpal/schemas';
import {
  AREA_RES,
  CELL_RES,
  CONTENT_TYPES,
  isCell,
  LISTING_DAYS,
  MOD_ACTIONS,
  nextState,
  parentCell,
  REPORT_REASONS,
} from '../lib/community-rules';
import type { CommunityStore, Profile } from '../lib/community-store';
import { problem } from '../lib/problem';
import type { Limit, RateLimiter } from '../lib/rate-limit';
import type { Authenticator } from './accounts';

export interface CommunityDeps {
  /** FEATURE_COMMUNITY: off by default; needs owner approval, a policy and a moderator (§20). */
  enabled: boolean;
  auth: Authenticator;
  store: CommunityStore;
  limiter: RateLimiter;
  /** New accounts wait this long before posting (§20 identity). */
  minAccountHours: number;
  /** Cloudflare Turnstile on posting, when a secret is configured. */
  turnstile?: { secret: string; fetch?: typeof fetch } | null;
  now?: () => number;
}

type Vars = { Variables: { traceId: string } };
type C = Context<Vars>;

/** Ten posts, events, listings, questions or reports an hour, refilled steadily. */
const POSTING: Limit = { capacity: 10, ratePerSecond: 10 / 3600 };
const DAY = 86_400_000;

const P = { description: 'Problem', content: { 'application/problem+json': { schema: Problem } } };
const problems = { 400: P, 401: P, 403: P, 404: P, 409: P, 429: P };
const body200 = { description: 'OK', content: { 'application/json': { schema: z.unknown() } } };
const OK = { 200: body200 };
const CREATED = { 201: { description: 'Created', content: { 'application/json': { schema: z.unknown() } } } };
const jsonBody = <S extends z.ZodType>(schema: S) => ({
  body: { content: { 'application/json': { schema } }, required: true },
});

const Cell = z.string().refine((s) => isCell(s, CELL_RES), 'Expected an H3 resolution-7 cell');
const Area = z.string().refine((s) => isCell(s, AREA_RES), 'Expected an H3 resolution-5 cell');
const Text = (max: number, min = 1) => z.string().trim().min(min).max(max);
const Turnstile = { turnstileToken: z.string().max(2048).optional() };
const Kind = z.enum(['seeds', 'cuttings', 'seedlings', 'produce', 'tools']);
const ListingAction = z.enum(['publish', 'withdraw', 'reserve', 'release', 'cancel', 'confirm', 'complete']);

const R = {
  status: createRoute({
    method: 'get',
    path: '/api/v1/community/status',
    summary: 'Is the community on here?',
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  profile: createRoute({
    method: 'get',
    path: '/api/v1/community/profile',
    summary: 'My community profile and moderation notices',
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  saveProfile: createRoute({
    method: 'put',
    path: '/api/v1/community/profile',
    summary: 'Create or update my community profile (coarse area only)',
    request: jsonBody(
      z
        .object({
          displayName: Text(40),
          cell: Cell,
          country: z
            .string()
            .regex(/^[A-Z]{2}$/)
            .nullable(),
          bio: z.string().trim().max(300).default(''),
        })
        .strict(),
    ),
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  feed: createRoute({
    method: 'get',
    path: '/api/v1/community/feed',
    summary: 'Posts in an area, newest first',
    request: {
      query: z.object({ area: Area.optional(), before: z.coerce.number().int().positive().optional() }),
    },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  post: createRoute({
    method: 'post',
    path: '/api/v1/community/posts',
    summary: 'Share a post (text)',
    request: jsonBody(z.object({ body: Text(2000), ...Turnstile })),
    tags: ['community'],
    responses: { ...CREATED, ...problems },
  }),
  events: createRoute({
    method: 'get',
    path: '/api/v1/community/events',
    summary: 'Upcoming events in an area',
    request: { query: z.object({ area: Area.optional() }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  createEvent: createRoute({
    method: 'post',
    path: '/api/v1/community/events',
    summary: 'Organise an event',
    request: jsonBody(
      z.object({
        title: Text(120),
        body: z.string().trim().max(2000).default(''),
        place: Text(120),
        startsAt: z.number().int().positive(),
        endsAt: z.number().int().positive(),
        capacity: z.number().int().min(1).max(500).nullable().default(null),
        ...Turnstile,
      }),
    ),
    tags: ['community'],
    responses: { ...CREATED, ...problems },
  }),
  rsvp: createRoute({
    method: 'put',
    path: '/api/v1/community/events/{id}/rsvp',
    summary: 'Going, maybe, or not any more',
    request: {
      params: z.object({ id: Id }),
      ...jsonBody(z.object({ status: z.enum(['going', 'maybe']).nullable() })),
    },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  cancelEvent: createRoute({
    method: 'post',
    path: '/api/v1/community/events/{id}/cancel',
    summary: 'Cancel my event',
    request: { params: z.object({ id: Id }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  listings: createRoute({
    method: 'get',
    path: '/api/v1/community/exchange',
    summary: 'Seeds, cuttings, seedlings, produce and tools on offer in an area',
    request: { query: z.object({ area: Area.optional(), kind: Kind.optional() }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  createListing: createRoute({
    method: 'post',
    path: '/api/v1/community/exchange',
    summary: 'Offer something (draft or listed). Species listed invasive in your country are refused.',
    request: jsonBody(
      z.object({
        kind: Kind,
        title: Text(120),
        body: z.string().trim().max(2000).default(''),
        scientificName: z.string().trim().min(3).max(120).nullable().default(null),
        quantity: z.string().trim().max(60).default(''),
        pickup: z.string().trim().max(200).default(''),
        publish: z.boolean().default(true),
        ...Turnstile,
      }),
    ),
    tags: ['community'],
    responses: { ...CREATED, ...problems },
  }),
  listing: createRoute({
    method: 'get',
    path: '/api/v1/community/exchange/{id}',
    summary: 'A listing with its public questions, and the reservation if I am a party',
    request: { params: z.object({ id: Id }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  act: createRoute({
    method: 'post',
    path: '/api/v1/community/exchange/{id}/{action}',
    summary: 'Move a listing through publish → reserve → confirm → complete (or withdraw, release, cancel)',
    request: { params: z.object({ id: Id, action: ListingAction }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  contact: createRoute({
    method: 'put',
    path: '/api/v1/community/exchange/{id}/contact',
    summary: 'My contact note for the other party, shown only once both have shared one',
    request: { params: z.object({ id: Id }), ...jsonBody(z.object({ contact: Text(200) })) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  ask: createRoute({
    method: 'post',
    path: '/api/v1/community/exchange/{id}/questions',
    summary: 'Ask or answer in the listing’s public Q&A',
    request: {
      params: z.object({ id: Id }),
      ...jsonBody(z.object({ body: Text(1000), parentId: Id.nullable().default(null), ...Turnstile })),
    },
    tags: ['community'],
    responses: { ...CREATED, ...problems },
  }),
  report: createRoute({
    method: 'post',
    path: '/api/v1/community/reports',
    summary: 'Report something for moderators',
    request: jsonBody(
      z.object({
        type: z.enum(CONTENT_TYPES),
        id: Id,
        reason: z.enum(REPORT_REASONS),
        note: z.string().trim().max(500).default(''),
      }),
    ),
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  blocks: createRoute({
    method: 'get',
    path: '/api/v1/community/blocks',
    summary: 'People I blocked',
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  block: createRoute({
    method: 'post',
    path: '/api/v1/community/blocks',
    summary: 'Block someone (both of you stop seeing each other’s posts and listings)',
    request: jsonBody(z.object({ userId: z.string().min(1).max(100) })),
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  unblock: createRoute({
    method: 'delete',
    path: '/api/v1/community/blocks/{userId}',
    summary: 'Unblock someone',
    request: { params: z.object({ userId: z.string().min(1).max(100) }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  appeal: createRoute({
    method: 'post',
    path: '/api/v1/community/appeals',
    summary: 'Appeal a moderation action on my content or account',
    request: jsonBody(z.object({ actionId: Id, body: Text(1000) })),
    tags: ['community'],
    responses: { ...CREATED, ...problems },
  }),
  map: createRoute({
    method: 'get',
    path: '/api/v1/community/map',
    summary: 'Active contributors per H3 cell; cells with fewer than five are hidden',
    request: { query: z.object({ area: Area.optional() }) },
    tags: ['community'],
    responses: { ...OK, ...problems },
  }),
  queue: createRoute({
    method: 'get',
    path: '/api/v1/admin/queue',
    summary: 'Reported and hidden items, and open appeals',
    tags: ['moderation'],
    responses: { ...OK, ...problems },
  }),
  moderate: createRoute({
    method: 'post',
    path: '/api/v1/admin/actions',
    summary: 'Hide, remove, restore, warn, suspend or ban (audited)',
    request: jsonBody(
      z.object({
        action: z.enum(MOD_ACTIONS),
        targetType: z.enum([...CONTENT_TYPES, 'user']),
        targetId: z.string().min(1).max(100),
        reason: Text(500),
        days: z.number().int().min(1).max(365).optional(),
      }),
    ),
    tags: ['moderation'],
    responses: { ...CREATED, ...problems },
  }),
  audit: createRoute({
    method: 'get',
    path: '/api/v1/admin/audit',
    summary: 'The moderation audit log',
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }) },
    tags: ['moderation'],
    responses: { ...OK, ...problems },
  }),
  decide: createRoute({
    method: 'post',
    path: '/api/v1/admin/appeals/{id}',
    summary: 'Uphold or overturn an appeal (overturning reverses the action)',
    request: {
      params: z.object({ id: Id }),
      ...jsonBody(z.object({ decision: z.enum(['upheld', 'overturned']) })),
    },
    tags: ['moderation'],
    responses: { ...OK, ...problems },
  }),
  staff: createRoute({
    method: 'put',
    path: '/api/v1/admin/staff',
    summary: 'Make someone a moderator or admin, or remove the role (admins only)',
    request: jsonBody(
      z.object({ userId: z.string().min(1).max(100), role: z.enum(['moderator', 'admin']).nullable() }),
    ),
    tags: ['moderation'],
    responses: { ...OK, ...problems },
  }),
};

/** Community routes (§20). Registered only when FEATURE_COMMUNITY is on, apart from the status. */
export function registerCommunityRoutes(app: OpenAPIHono<Vars>, deps: CommunityDeps) {
  const now = () => deps.now?.() ?? Date.now();
  app.openapi(R.status, (c) => c.json({ enabled: deps.enabled }, 200));
  if (!deps.enabled) return;
  const s = deps.store;
  const fail = (
    c: C,
    status: 400 | 401 | 403 | 404 | 409 | 429,
    code: Parameters<typeof problem>[2],
    detail?: string,
  ) => problem(c, status, code, detail) as never;

  /** For guards: a problem response the handler returns as is. */
  const deny = (
    c: C,
    status: 401 | 403 | 400,
    code: Parameters<typeof problem>[2],
    detail?: string,
  ): Response => problem(c, status, code, detail);
  const signedIn = async (c: C) => deps.auth.userOf(c.req.raw);
  const withProfile = async (c: C) => {
    const u = await signedIn(c);
    if (!u) return { error: deny(c, 401, 'UNAUTHENTICATED') };
    const p = await s.profile(u.id);
    if (!p) return { error: deny(c, 403, 'FORBIDDEN', 'Create a community profile first') };
    return { u, p };
  };

  /** Everything that publishes something: profile, standing, account age, Turnstile, rate limit. */
  const poster = async (c: C, token?: string) => {
    const g = await withProfile(c);
    if ('error' in g) return g;
    const t = now();
    if (g.p.status === 'banned')
      return { error: deny(c, 403, 'FORBIDDEN', 'This account can no longer post') };
    if (g.p.status === 'suspended' && (g.p.suspendedUntil ?? Infinity) > t)
      return {
        error: fail(
          c,
          403,
          'FORBIDDEN',
          `Posting is paused until ${new Date(g.p.suspendedUntil ?? t).toISOString()}`,
        ),
      };
    const age = g.u.createdAt === undefined ? Infinity : t - g.u.createdAt;
    if (age < deps.minAccountHours * 3_600_000)
      return {
        error: fail(c, 403, 'FORBIDDEN', `New accounts can post after ${deps.minAccountHours} hours`),
      };
    if (deps.turnstile) {
      if (!token || !(await turnstileOk(token, deps.turnstile)))
        return { error: deny(c, 400, 'VALIDATION_FAILED', 'Please complete the check and try again') };
    }
    const r = await deps.limiter.take(`community:${g.u.id}`, POSTING);
    if (!r.allowed)
      return {
        error: problem(c, 429, 'RATE_LIMITED', 'You are posting a lot; try again a little later', {
          retryAfterSeconds: Math.ceil(r.retryAfterMs / 1000),
        }),
      };
    return g;
  };

  const staffOnly = async (c: C, need: 'moderator' | 'admin' = 'moderator') => {
    const u = await signedIn(c);
    if (!u) return { error: deny(c, 401, 'UNAUTHENTICATED') };
    const role = await s.staffRole(u.id);
    if (!role || (need === 'admin' && role !== 'admin')) return { error: deny(c, 403, 'FORBIDDEN') };
    return { u, role };
  };

  const areaOf = (p: Profile, area?: string) => area ?? p.area;

  app.openapi(R.profile, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    return c.json(
      {
        profile: await s.profile(u.id),
        staff: await s.staffRole(u.id),
        notices: await s.actionsAbout(u.id),
      },
      200,
    );
  });

  app.openapi(R.saveProfile, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    const body = c.req.valid('json');
    await s.saveProfile({ userId: u.id, ...body, area: parentCell(body.cell, AREA_RES) }, now());
    return c.json({ profile: await s.profile(u.id) }, 200);
  });

  app.openapi(R.feed, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const { area, before } = c.req.valid('query');
    return c.json({ posts: await s.feed(areaOf(g.p, area), g.u.id, before ?? now() + 1, 30) }, 200);
  });

  app.openapi(R.post, async (c) => {
    const body = c.req.valid('json');
    const g = await poster(c, body.turnstileToken);
    if ('error' in g) return g.error as never;
    const id = await s.createPost(
      { authorId: g.u.id, area: g.p.area, cell: g.p.cell, body: body.body },
      now(),
    );
    return c.json({ id }, 201);
  });

  app.openapi(R.events, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    return c.json({ events: await s.events(areaOf(g.p, c.req.valid('query').area), g.u.id, now()) }, 200);
  });

  app.openapi(R.createEvent, async (c) => {
    const body = c.req.valid('json');
    if (body.endsAt <= body.startsAt || body.startsAt < now() - DAY || body.endsAt - body.startsAt > 14 * DAY)
      return fail(c, 400, 'VALIDATION_FAILED', 'Check the start and end times');
    const g = await poster(c, body.turnstileToken);
    if ('error' in g) return g.error as never;
    const { turnstileToken: _t, ...e } = body;
    const id = await s.createEvent({ ...e, organiserId: g.u.id, area: g.p.area, cell: g.p.cell }, now());
    return c.json({ id }, 201);
  });

  app.openapi(R.rsvp, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const { id } = c.req.valid('param');
    const ev = await s.event(id, g.u.id);
    if (!ev || ev.visibility !== 'visible') return fail(c, 404, 'NOT_FOUND');
    if (!(await s.rsvp(id, g.u.id, c.req.valid('json').status, now())))
      return fail(
        c,
        409,
        'VERSION_CONFLICT',
        ev.cancelledAt ? 'This event was cancelled' : 'This event is full',
      );
    return c.json({ event: await s.event(id, g.u.id) }, 200);
  });

  app.openapi(R.cancelEvent, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    if (!(await s.cancelEvent(c.req.valid('param').id, g.u.id, now()))) return fail(c, 404, 'NOT_FOUND');
    return c.json({ ok: true }, 200);
  });

  app.openapi(R.listings, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const { area, kind } = c.req.valid('query');
    await s.sweep(null, now());
    return c.json({ listings: await s.listings(areaOf(g.p, area), g.u.id, kind ?? null) }, 200);
  });

  /** Biosecurity (§6.13): species listed invasive in the person's country cannot be shared. */
  const invasive = (scientificName: string | null, country: string | null) => {
    if (!scientificName || !country) return null;
    const name = scientificName.toLowerCase();
    const taxon = SEED_PACK.taxa.find((t) => t.scientificName.toLowerCase() === name);
    if (!taxon) return null;
    return nativeStatusOf(taxon, { countryCode: country, l3: null }) === 'INVASIVE_LISTED'
      ? `${taxon.scientificName} is listed invasive in ${country}, so it can't be shared here. Local rules vary; please dispose of it safely.`
      : null;
  };

  app.openapi(R.createListing, async (c) => {
    const body = c.req.valid('json');
    const g = await poster(c, body.turnstileToken);
    if ('error' in g) return g.error as never;
    const blocked = body.publish ? invasive(body.scientificName, g.p.country) : null;
    if (blocked) return fail(c, 400, 'VALIDATION_FAILED', blocked);
    const t = now();
    const state = body.publish ? 'listed' : 'draft';
    const id = await s.createListing(
      {
        ownerId: g.u.id,
        area: g.p.area,
        cell: g.p.cell,
        kind: body.kind,
        title: body.title,
        body: body.body,
        scientificName: body.scientificName,
        quantity: body.quantity,
        pickup: body.pickup,
        state,
        expiresAt: t + LISTING_DAYS * DAY,
      },
      t,
    );
    return c.json({ id, state }, 201);
  });

  const listingView = async (id: string, viewer: string) => {
    const l = await s.listing(id, viewer);
    if (!l) return null;
    const r = await s.reservationOf(id);
    const role = l.ownerId === viewer ? 'owner' : r?.requesterId === viewer ? 'requester' : null;
    const both = Boolean(r?.ownerContact && r?.requesterContact);
    return {
      listing: l,
      role,
      questions: await s.questions(id, viewer),
      // Parties see the reservation; contact notes only once both have shared one (mutual consent).
      reservation:
        r && role
          ? {
              state: r.state,
              expiresAt: r.expiresAt,
              ownerConfirmed: r.ownerConfirmedAt !== null,
              requesterConfirmed: r.requesterConfirmedAt !== null,
              mySharedContact: role === 'owner' ? r.ownerContact !== null : r.requesterContact !== null,
              contacts: both ? { owner: r.ownerContact, requester: r.requesterContact } : null,
            }
          : null,
    };
  };

  app.openapi(R.listing, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const { id } = c.req.valid('param');
    await s.sweep(id, now());
    const v = await listingView(id, g.u.id);
    if (!v) return fail(c, 404, 'NOT_FOUND');
    return c.json(v, 200);
  });

  // Registered before the {action} route, which would otherwise match …/questions.
  app.openapi(R.ask, async (c) => {
    const body = c.req.valid('json');
    const g = await poster(c, body.turnstileToken);
    if ('error' in g) return g.error as never;
    const { id } = c.req.valid('param');
    const l = await s.listing(id, g.u.id);
    if (!l || l.visibility !== 'visible') return fail(c, 404, 'NOT_FOUND');
    if (await s.blockedEitherWay(g.u.id, l.ownerId)) return fail(c, 403, 'FORBIDDEN');
    const qid = await s.ask(
      { listingId: id, authorId: g.u.id, parentId: body.parentId, body: body.body },
      now(),
    );
    return c.json({ id: qid }, 201);
  });

  app.openapi(R.act, async (c) => {
    const { id, action } = c.req.valid('param');
    const g = action === 'reserve' ? await poster(c) : await withProfile(c);
    if ('error' in g) return g.error as never;
    const t = now();
    await s.sweep(id, t);
    const l = await s.listing(id, g.u.id);
    if (!l || l.visibility !== 'visible') return fail(c, 404, 'NOT_FOUND');
    const r = await s.reservationOf(id);
    const isOwner = l.ownerId === g.u.id;
    const isRequester = r?.state === 'active' && r.requesterId === g.u.id;
    const refuse = (detail: string) => fail(c, 409, 'VERSION_CONFLICT', detail);
    let done = false;
    switch (action) {
      case 'publish': {
        if (!isOwner) return fail(c, 403, 'FORBIDDEN');
        const blocked = invasive(l.scientificName, g.p.country);
        if (blocked) return fail(c, 400, 'VALIDATION_FAILED', blocked);
        done = await s.setListingState(id, g.u.id, ['draft'], nextState('draft', 'publish')!, t);
        break;
      }
      case 'withdraw':
        if (!isOwner) return fail(c, 403, 'FORBIDDEN');
        done = await s.setListingState(id, g.u.id, ['draft', 'listed'], 'withdrawn', t);
        break;
      case 'reserve':
        if (isOwner) return fail(c, 403, 'FORBIDDEN', 'You can’t reserve your own listing');
        if (await s.blockedEitherWay(g.u.id, l.ownerId)) return fail(c, 403, 'FORBIDDEN');
        if (!(await s.reserve(id, g.u.id, t))) return refuse('Someone else reserved this first');
        return c.json(await listingView(id, g.u.id), 200);
      case 'release':
        if (!isOwner) return fail(c, 403, 'FORBIDDEN');
        done = await s.endReservation(id, 'owner', g.u.id, t);
        break;
      case 'cancel':
        if (!isRequester) return fail(c, 403, 'FORBIDDEN');
        done = await s.endReservation(id, 'requester', g.u.id, t);
        break;
      case 'confirm':
        if (!isOwner && !isRequester) return fail(c, 403, 'FORBIDDEN');
        if (l.state !== 'reserved') return refuse('Nothing to confirm');
        done = await s.confirmHandoff(id, isOwner ? 'owner' : 'requester', t);
        break;
      case 'complete':
        if (!isOwner && !isRequester) return fail(c, 403, 'FORBIDDEN');
        done = await s.complete(id, t);
        break;
    }
    if (!done) return refuse(`This listing is ${l.state.replace('_', ' ')}`);
    return c.json(await listingView(id, g.u.id), 200);
  });

  app.openapi(R.contact, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const { id } = c.req.valid('param');
    const l = await s.listing(id, g.u.id);
    const r = await s.reservationOf(id);
    if (!l || !r) return fail(c, 404, 'NOT_FOUND');
    const role = l.ownerId === g.u.id ? 'owner' : r.requesterId === g.u.id ? 'requester' : null;
    if (!role) return fail(c, 403, 'FORBIDDEN');
    await s.setContact(id, role, c.req.valid('json').contact, now());
    return c.json(await listingView(id, g.u.id), 200);
  });

  app.openapi(R.report, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const body = c.req.valid('json');
    const author = await s.authorOf(body.type, body.id);
    if (!author) return fail(c, 404, 'NOT_FOUND');
    if (author === g.u.id) return fail(c, 400, 'VALIDATION_FAILED', 'You can’t report your own post');
    const r = await deps.limiter.take(`community-report:${g.u.id}`, POSTING);
    if (!r.allowed) return fail(c, 429, 'RATE_LIMITED');
    await s.report({ ...body, reporterId: g.u.id }, now());
    // Reporters are not told whether the item was hidden, so reports can't be used to probe.
    return c.json({ ok: true }, 200);
  });

  app.openapi(R.blocks, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    return c.json({ blocks: await s.blocks(u.id) }, 200);
  });

  app.openapi(R.block, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    const { userId } = c.req.valid('json');
    if (userId === u.id) return fail(c, 400, 'VALIDATION_FAILED');
    await s.block(u.id, userId, now());
    return c.json({ ok: true }, 200);
  });

  app.openapi(R.unblock, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    await s.unblock(u.id, c.req.valid('param').userId);
    return c.json({ ok: true }, 200);
  });

  app.openapi(R.appeal, async (c) => {
    const u = await signedIn(c);
    if (!u) return fail(c, 401, 'UNAUTHENTICATED');
    const { actionId, body } = c.req.valid('json');
    const r = await s.appeal(actionId, u.id, body, now());
    if (!r) return fail(c, 404, 'NOT_FOUND');
    if (!r.id) return fail(c, 409, 'VERSION_CONFLICT', 'You already appealed this');
    return c.json({ id: r.id }, 201);
  });

  app.openapi(R.map, async (c) => {
    const g = await withProfile(c);
    if ('error' in g) return g.error as never;
    const area = areaOf(g.p, c.req.valid('query').area);
    return c.json({ area, cells: await s.mapCells(area, now()) }, 200);
  });

  app.openapi(R.queue, async (c) => {
    const g = await staffOnly(c);
    if ('error' in g) return g.error as never;
    return c.json(await s.queue(), 200);
  });

  app.openapi(R.moderate, async (c) => {
    const g = await staffOnly(c);
    if ('error' in g) return g.error as never;
    const body = c.req.valid('json');
    const contentAction = ['hide', 'unhide', 'remove', 'restore', 'warn'].includes(body.action);
    if (
      body.targetType === 'user'
        ? ['hide', 'unhide', 'remove', 'restore'].includes(body.action)
        : !contentAction
    )
      return fail(c, 400, 'VALIDATION_FAILED', `${body.action} does not apply to a ${body.targetType}`);
    if (body.targetType === 'user' && body.targetId === g.u.id) return fail(c, 400, 'VALIDATION_FAILED');
    const r = await s.moderate({ ...body, moderatorId: g.u.id }, now());
    if (!r) return fail(c, 404, 'NOT_FOUND');
    return c.json(r, 201);
  });

  app.openapi(R.audit, async (c) => {
    const g = await staffOnly(c);
    if ('error' in g) return g.error as never;
    return c.json({ actions: await s.audit(c.req.valid('query').limit) }, 200);
  });

  app.openapi(R.decide, async (c) => {
    const g = await staffOnly(c);
    if ('error' in g) return g.error as never;
    if (!(await s.decideAppeal(c.req.valid('param').id, g.u.id, c.req.valid('json').decision, now())))
      return fail(c, 404, 'NOT_FOUND');
    return c.json({ ok: true }, 200);
  });

  app.openapi(R.staff, async (c) => {
    const g = await staffOnly(c, 'admin');
    if ('error' in g) return g.error as never;
    const { userId, role } = c.req.valid('json');
    if (userId === g.u.id) return fail(c, 400, 'VALIDATION_FAILED', 'Ask another admin to change your role');
    await s.setStaff(userId, role, now());
    return c.json({ ok: true }, 200);
  });
}

/** Cloudflare Turnstile server-side check (the only outbound call here, to a fixed URL). */
async function turnstileOk(token: string, t: { secret: string; fetch?: typeof fetch }): Promise<boolean> {
  try {
    const res = await (t.fetch ?? fetch)('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: t.secret, response: token }),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
