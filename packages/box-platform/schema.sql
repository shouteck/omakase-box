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
  association TEXT,
  head_sha TEXT,
  on_default INTEGER,
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
-- People: the GitHub identity and what each chose to publish. No token, no email
-- beyond one a solver lists, and a session holds only the hash of its cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS methods (
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  chain TEXT,
  visibility TEXT NOT NULL,
  PRIMARY KEY (github_id, position)
);
CREATE INDEX IF NOT EXISTS methods_login ON methods (login);
CREATE TABLE IF NOT EXISTS receipts (
  bounty_id TEXT PRIMARY KEY,
  payee TEXT NOT NULL,
  says TEXT NOT NULL,
  record_at TEXT NOT NULL,
  at TEXT NOT NULL
);
-- The owner's "paid" click, or its withdrawal: one standing row, weighed against the chain's events by date.
CREATE TABLE IF NOT EXISTS paid_clicks (
  bounty_id TEXT PRIMARY KEY,
  by_login TEXT NOT NULL,
  to_login TEXT,
  amount INTEGER,
  withdrawn INTEGER NOT NULL,
  at TEXT NOT NULL
);
-- When a hint last moved this bounty's read earlier. Kept one minute; nothing else from a hint is kept.
CREATE TABLE IF NOT EXISTS hints (
  bounty_id TEXT PRIMARY KEY,
  at INTEGER NOT NULL
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
