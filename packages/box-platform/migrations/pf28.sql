-- PF28: a bounty's event chain gets its own read time. Run once on a board deployed before PF28, before deploying it.
-- Each bounty keeps the time its details were last read, so nothing is read again all at once.
ALTER TABLE bounties ADD COLUMN events_read_at INTEGER NOT NULL DEFAULT 0;
UPDATE bounties SET events_read_at = details_read_at;
