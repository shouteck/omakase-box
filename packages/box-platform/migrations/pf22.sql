-- PF22: "new since" and attempts in progress. Run once on a board deployed before PF22, before deploying it.
-- Bounties already listed take their order from when they were posted, oldest first, so a solver starting
-- from the beginning sees each once; pull requests learn their draft flag at the next refresh.
ALTER TABLE bounties ADD COLUMN listed_seq INTEGER;
ALTER TABLE pull_requests ADD COLUMN draft INTEGER;
ALTER TABLE pull_requests ADD COLUMN updated_at TEXT;
UPDATE bounties SET listed_seq = (SELECT COUNT(*) FROM bounties x WHERE x.created_at < bounties.created_at OR (x.created_at = bounties.created_at AND x.id <= bounties.id)) WHERE listed_seq IS NULL;
CREATE INDEX IF NOT EXISTS bounties_listed ON bounties (listed_seq);
