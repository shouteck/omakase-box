ALTER TABLE pull_requests ADD COLUMN landing_sha TEXT;
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf45-bt68.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'the record itself');
