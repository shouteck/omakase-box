ALTER TABLE pull_requests ADD COLUMN landing_checked_at INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf47-bt68.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'the record itself');
