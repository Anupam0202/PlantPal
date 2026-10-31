-- Provider health and kill switches (§15.1).
CREATE TABLE IF NOT EXISTS provider_status (
  provider TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER DEFAULT 1 NOT NULL CHECK (enabled IN (0, 1)),
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT,
  last_latency_ms INTEGER CHECK (last_latency_ms IS NULL OR last_latency_ms >= 0),
  consecutive_failures INTEGER DEFAULT 0 NOT NULL CHECK (consecutive_failures >= 0),
  updated_at INTEGER NOT NULL
);
