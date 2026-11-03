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
  poster_id INTEGER,
  issue_state TEXT NOT NULL,
  closed_at TEXT,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  work_commit TEXT NOT NULL,
  approved_by TEXT,
  seen_at INTEGER NOT NULL,
  details_read_at INTEGER NOT NULL DEFAULT 0,
  -- PF28: the event chain is read as its own step, so neither step can hold up the other or the rest.
  events_read_at INTEGER NOT NULL DEFAULT 0,
  -- PF22: the order the board first listed it in, so "new since" never skips one read late.
  listed_seq INTEGER
);
CREATE INDEX IF NOT EXISTS bounties_board ON bounties (issue_state, created_at);
CREATE INDEX IF NOT EXISTS bounties_listed ON bounties (listed_seq);
CREATE TABLE IF NOT EXISTS pull_requests (
  bounty_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  author TEXT NOT NULL,
  author_id INTEGER,
  state TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  merged_at TEXT,
  association TEXT,
  head_sha TEXT,
  on_default INTEGER,
  -- PF22: GitHub's draft flag and last activity, from the list the refresh already reads.
  draft INTEGER,
  updated_at TEXT,
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
-- Pay on merge (PF11). Stripe holds the card and the money; the board holds only Stripe's ids.
-- A solver's own account, tied to the GitHub id that connected it.
CREATE TABLE IF NOT EXISTS stripe_accounts (
  github_id INTEGER PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE,
  ready INTEGER NOT NULL DEFAULT 0
);
-- An owner's saved card and the most one bounty may charge it.
CREATE TABLE IF NOT EXISTS pay_settings (
  github_id INTEGER PRIMARY KEY,
  customer_id TEXT NOT NULL,
  payment_method TEXT,
  card_label TEXT,
  limit_per_bounty INTEGER
);
-- The owner's switch, per repository, with its own limit (PF19). A merge from before on_at is never charged.
CREATE TABLE IF NOT EXISTS pay_repositories (
  github_id INTEGER NOT NULL,
  repository TEXT NOT NULL COLLATE NOCASE,
  on_at TEXT NOT NULL,
  limit_per_bounty INTEGER,
  PRIMARY KEY (github_id, repository)
);
-- One row per bounty: merged takes all, so a bounty is charged at most once.
CREATE TABLE IF NOT EXISTS charges (
  bounty_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  pull_number INTEGER,
  solver TEXT,
  account_id TEXT,
  amount INTEGER,
  payment_method TEXT,
  payment_intent TEXT,
  at INTEGER NOT NULL,
  -- NULL is Stripe. 'paypal': account_id is the PayPal account ID, payment_intent the order, then the capture.
  provider TEXT
);
CREATE INDEX IF NOT EXISTS charges_intent ON charges (payment_intent);
-- A solver's connected PayPal account. Only the account ID: never an email.
CREATE TABLE IF NOT EXISTS paypal_accounts (
  github_id INTEGER PRIMARY KEY,
  payer_id TEXT NOT NULL,
  at INTEGER NOT NULL
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
