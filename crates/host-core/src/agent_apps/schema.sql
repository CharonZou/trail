-- Registered external web applications (schema v28).
--
-- An application is an entry the user can open inside the work panel. It is
-- registry data only: host-core never serves or proxies the target. `remote`
-- entries are http(s) URLs the desktop browser view loads; `folder` entries are
-- absolute local directories whose `index.html` the desktop serves through the
-- existing local-file path. The renderer re-validates the entry at open time.
CREATE TABLE IF NOT EXISTS agent_apps (
  id             TEXT PRIMARY KEY NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL CHECK (kind IN ('remote', 'folder')),
  entry          TEXT NOT NULL,
  icon           TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  last_opened_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_apps_order
  ON agent_apps(sort_order, created_at);
