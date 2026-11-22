ALTER TABLE bounties ADD COLUMN approval_at TEXT;
ALTER TABLE bounties ADD COLUMN approved_amount INTEGER;
ALTER TABLE bounties ADD COLUMN merge_consent INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bounties ADD COLUMN merge_rail TEXT CHECK (merge_rail IN ('stripe', 'paypal'));
ALTER TABLE charges ADD COLUMN origin TEXT CHECK (origin IN ('merge', 'agent', 'owner'));
INSERT OR IGNORE INTO meta (key, value) VALUES ('pf52_deployed_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
ALTER TABLE stripe_accounts ADD COLUMN ready_at TEXT;
ALTER TABLE stripe_accounts ADD COLUMN ready_version INTEGER;
UPDATE stripe_accounts SET ready_at = (SELECT value FROM meta WHERE key = 'pf52_deployed_at') WHERE ready = 1 AND ready_at IS NULL;
UPDATE stripe_accounts SET ready_version = CAST(ROUND((julianday((SELECT value FROM meta WHERE key = 'pf52_deployed_at')) - 2440587.5) * 86400000) AS INTEGER) * 2 + CASE WHEN ready = 0 THEN 1 ELSE 0 END;
CREATE TRIGGER IF NOT EXISTS stripe_ready_changed AFTER UPDATE OF ready ON stripe_accounts
WHEN NEW.ready_version IS OLD.ready_version OR (NEW.ready = 0 AND NEW.ready_at IS NOT NULL) OR (NEW.ready = 1 AND (NEW.ready_at IS NULL OR (OLD.ready = 0 AND NEW.ready_at IS OLD.ready_at)))
BEGIN
  UPDATE stripe_accounts SET ready_at = CASE WHEN NEW.ready = 0 THEN NULL WHEN OLD.ready = 0 OR NEW.ready_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE NEW.ready_at END,
    ready_version = CASE WHEN NEW.ready_version IS OLD.ready_version THEN MAX(COALESCE(OLD.ready_version, 0), CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER) * 2 + CASE WHEN NEW.ready = 0 THEN 1 ELSE 0 END) ELSE NEW.ready_version END WHERE github_id = NEW.github_id;
END;
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
