-- Accounts, sharing and sync (M10, ADR-0013). Mirrors packages/db/src/schema.ts.
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  change_floor INTEGER DEFAULT 0 NOT NULL CHECK (change_floor >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'gardener', 'helper', 'viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);

CREATE TABLE IF NOT EXISTS records (
  entity TEXT NOT NULL,
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  deleted_at INTEGER,
  dedupe_key TEXT,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE INDEX IF NOT EXISTS records_workspace_idx ON records (workspace_id, entity);
CREATE INDEX IF NOT EXISTS records_dedupe_idx ON records (workspace_id, entity, dedupe_key);

CREATE TABLE IF NOT EXISTS sync_changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  version INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_changes_workspace_idx ON sync_changes (workspace_id, seq);

CREATE TABLE IF NOT EXISTS idempotency (
  op_id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idempotency_actor_idx ON idempotency (actor_id, at);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gardener', 'helper', 'viewer')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invitations_workspace_idx ON invitations (workspace_id);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  garden_id TEXT NOT NULL,
  label TEXT NOT NULL,
  zone_ids TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > starts_at),
  revoked_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_links_workspace_idx ON share_links (workspace_id);
