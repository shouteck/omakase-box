-- PF44: an imported listing waits for its owner's approval, given as a comment on the GitHub issue. Run once on the live
-- database before the deploy.
ALTER TABLE bounties ADD COLUMN approval TEXT;
ALTER TABLE bounties ADD COLUMN approval_proof TEXT;
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf44.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'the record itself');
