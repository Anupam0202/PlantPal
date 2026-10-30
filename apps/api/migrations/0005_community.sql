-- Community (M11, behind FEATURE_COMMUNITY). Public surfaces store only coarse H3 cells
-- (resolution 7, about 5 km²) and their resolution-5 area; never coordinates (§19).

CREATE TABLE community_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  cell TEXT NOT NULL,
  area TEXT NOT NULL,
  country TEXT,
  bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  suspended_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX community_profiles_cell_idx ON community_profiles (cell);

CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  area TEXT NOT NULL,
  cell TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'removed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX community_posts_area_idx ON community_posts (area, created_at);

CREATE TABLE community_events (
  id TEXT PRIMARY KEY,
  organiser_id TEXT NOT NULL,
  area TEXT NOT NULL,
  cell TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  place TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  capacity INTEGER,
  cancelled_at INTEGER,
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'removed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX community_events_area_idx ON community_events (area, starts_at);

CREATE TABLE community_rsvps (
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going', 'maybe')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE exchange_listings (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  area TEXT NOT NULL,
  cell TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('seeds', 'cuttings', 'seedlings', 'produce', 'tools')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scientific_name TEXT,
  quantity TEXT NOT NULL DEFAULT '',
  pickup TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK (state IN ('draft', 'listed', 'reserved', 'handoff_confirmed', 'completed', 'withdrawn', 'expired')),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'removed')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX exchange_listings_area_idx ON exchange_listings (area, state, created_at);

CREATE TABLE exchange_reservations (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'released', 'cancelled', 'expired', 'completed')),
  expires_at INTEGER NOT NULL,
  owner_confirmed_at INTEGER,
  requester_confirmed_at INTEGER,
  owner_contact TEXT,
  requester_contact TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- At most one live reservation per listing, enforced by the database as well as the state check.
CREATE UNIQUE INDEX exchange_one_active_reservation ON exchange_reservations (listing_id)
  WHERE state = 'active';
CREATE INDEX exchange_reservations_requester_idx ON exchange_reservations (requester_id);

CREATE TABLE exchange_questions (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  parent_id TEXT,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden', 'removed')),
  created_at INTEGER NOT NULL
);
CREATE INDEX exchange_questions_listing_idx ON exchange_questions (listing_id, created_at);

CREATE TABLE community_reports (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'event', 'listing', 'question')),
  content_id TEXT NOT NULL,
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'invasive_or_unsafe', 'illegal', 'misinformation', 'other')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (content_type, content_id, reporter_id)
);
CREATE INDEX community_reports_open_idx ON community_reports (resolved_at, content_type, content_id);

CREATE TABLE community_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX community_blocks_blocked_idx ON community_blocks (blocked_id);

-- Moderators and admins. Granted only by an admin (the first admin is set with wrangler d1 execute).
CREATE TABLE community_staff (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('moderator', 'admin')),
  created_at INTEGER NOT NULL
);

-- Audit log: every moderation action, who took it and why. Never edited.
CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'event', 'listing', 'question', 'user')),
  target_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX moderation_actions_subject_idx ON moderation_actions (subject_id, created_at);

CREATE TABLE moderation_appeals (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'upheld', 'overturned')),
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL
);
