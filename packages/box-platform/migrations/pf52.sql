ALTER TABLE bounties ADD COLUMN approval_at TEXT;
ALTER TABLE bounties ADD COLUMN approved_amount INTEGER;
ALTER TABLE bounties ADD COLUMN merge_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bounties ADD COLUMN merge_rail TEXT CHECK (merge_rail IN ('stripe', 'paypal'));
ALTER TABLE charges ADD COLUMN origin TEXT CHECK (origin IN ('merge', 'agent', 'owner'));
CREATE TABLE IF NOT EXISTS payment_preferences (
  github_id INTEGER PRIMARY KEY,
  rail TEXT CHECK (rail IN ('stripe', 'paypal')),
  fallback INTEGER NOT NULL DEFAULT 0 CHECK (fallback IN (0, 1))
);
INSERT OR IGNORE INTO meta (key, value) SELECT 'merge_payment_off/' || bounty_id, 'solver-not-ready' FROM charges WHERE state = 'solver-not-ready';
UPDATE pull_requests SET on_default = NULL WHERE bounty_id IN (SELECT id FROM bounties WHERE source = 'listed');
CREATE TABLE IF NOT EXISTS paypal_vault (
  github_id INTEGER PRIMARY KEY,
  payment_token TEXT NOT NULL,
  label TEXT NOT NULL,
  limit_per_bounty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS paypal_vault_setup (
  github_id INTEGER PRIMARY KEY,
  setup_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf52.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'the record itself');
