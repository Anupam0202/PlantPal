import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Health and kill switch per environmental data provider (master prompt §15.1). Times are epoch ms. */
export const providerStatus = sqliteTable('provider_status', {
  provider: text('provider').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSuccessAt: integer('last_success_at'),
  lastErrorAt: integer('last_error_at'),
  lastErrorCode: text('last_error_code'),
  lastLatencyMs: integer('last_latency_ms'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});
export type ProviderStatusRow = typeof providerStatus.$inferSelect;

// ---------------------------------------------------------------- accounts, sharing and sync (M10)

/** A shared garden space. Members and their roles live in `memberships`. */
export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull(),
  /** Changes before this sequence number were pruned: older cursors need a snapshot (§14.3). */
  changeFloor: integer('change_floor').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const memberships = sqliteTable(
  'memberships',
  {
    workspaceId: text('workspace_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'gardener', 'helper', 'viewer'] }).notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

/** Every synced record, validated and stored whole, keyed by type and id (ADR-0013). */
export const records = sqliteTable(
  'records',
  {
    entity: text('entity').notNull(),
    id: text('id').notNull(),
    workspaceId: text('workspace_id').notNull(),
    version: integer('version').notNull(),
    deletedAt: integer('deleted_at'),
    dedupeKey: text('dedupe_key'),
    payload: text('payload').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.entity, t.id] }),
    index('records_workspace_idx').on(t.workspaceId, t.entity),
    index('records_dedupe_idx').on(t.workspaceId, t.entity, t.dedupeKey),
  ],
);

/** Append-only change log; the cursor for pull is `seq`. */
export const syncChanges = sqliteTable(
  'sync_changes',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    workspaceId: text('workspace_id').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op', { enum: ['upsert', 'delete'] }).notNull(),
    version: integer('version').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('sync_changes_workspace_idx').on(t.workspaceId, t.seq)],
);

/** One row per applied op id: same id + same payload is a duplicate; a different payload is refused. */
export const idempotency = sqliteTable(
  'idempotency',
  {
    opId: text('op_id').primaryKey(),
    actorId: text('actor_id').notNull(),
    payloadHash: text('payload_hash').notNull(),
    result: text('result').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    at: integer('at').notNull(),
  },
  (t) => [index('idempotency_actor_idx').on(t.actorId, t.at)],
);

/** Single-use invitation links. Only the SHA-256 of the token is stored. */
export const invitations = sqliteTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    role: text('role', { enum: ['gardener', 'helper', 'viewer'] }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    usedBy: text('used_by'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('invitations_workspace_idx').on(t.workspaceId)],
);

/** Plant-sitter links: scoped to zones and dates, expiring, revocable; only the token hash is stored. */
export const shareLinks = sqliteTable(
  'share_links',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    gardenId: text('garden_id').notNull(),
    label: text('label').notNull(),
    zoneIds: text('zone_ids').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    startsAt: integer('starts_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    createdBy: text('created_by').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('share_links_workspace_idx').on(t.workspaceId)],
);

/** Web Push subscriptions (migration 0004). */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: integer('created_at').notNull(),
    lastSuccessAt: integer('last_success_at'),
    failures: integer('failures').notNull().default(0),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);
