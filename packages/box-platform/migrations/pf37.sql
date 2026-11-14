-- PF37: the database records which migration files ran, so applying one twice is visible and a deploy guide can ask the
-- database instead of a person's memory. Safe to run twice. Run once on the live database before the deploy:
--   node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf37.sql
-- The seven older files were applied by hand before this record existed; they are recorded with this run's date, and the
-- note says so. From here on, each migration ends with its own INSERT OR IGNORE INTO migrations.
CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  note TEXT
);
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES
  ('pf11.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf13.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf19.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf22.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf28.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf29.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown'),
  ('pf32.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'recorded by pf37; applied earlier, real date unknown');
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf37.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'the record itself');
