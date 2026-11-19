-- BT67: whether a posted bounty's pull request head was already on the default branch when the board first read it
-- open. Such a head is work that had landed before the pull request, so a later merge owes its author nothing. Run once
-- on the live database before the deploy:
--   node node_modules/wrangler/bin/wrangler.js d1 execute open-bounty-board --remote --file migrations/pf38-bt67.sql
ALTER TABLE pull_requests ADD COLUMN head_on_default_at_sight INTEGER;
INSERT OR IGNORE INTO migrations (name, applied_at, note) VALUES ('pf38-bt67.sql', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL);
