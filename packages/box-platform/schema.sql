-- The board's store: only identifiers and facts it read from GitHub. Run as-is
-- by D1 (wrangler d1 execute --file) and by the local shim on node:sqlite.
CREATE TABLE IF NOT EXISTS repositories (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  language TEXT,
  default_branch TEXT NOT NULL,
  read_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bounties (
  id TEXT PRIMARY KEY,
  repository TEXT NOT NULL COLLATE NOCASE,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  poster TEXT NOT NULL,
  issue_state TEXT NOT NULL,
  closed_at TEXT,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  work_commit TEXT NOT NULL,
  approved_by TEXT,
  seen_at INTEGER NOT NULL,
  details_read_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS bounties_board ON bounties (issue_state, created_at);
CREATE TABLE IF NOT EXISTS pull_requests (
  bounty_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  author TEXT NOT NULL,
  state TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  merged_at TEXT,
  PRIMARY KEY (bounty_id, number)
);
CREATE TABLE IF NOT EXISTS events (
  bounty_id TEXT NOT NULL,
  sha TEXT NOT NULL,
  at TEXT,
  type TEXT,
  pull_request INTEGER,
  amount INTEGER,
  withdrawn INTEGER,
  kind TEXT,
  PRIMARY KEY (bounty_id, sha)
);
CREATE TABLE IF NOT EXISTS log (
  at INTEGER NOT NULL,
  reason TEXT NOT NULL,
  issue TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
