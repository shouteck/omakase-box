-- PF32: a bounty listed from the board on an existing issue. Run once on the live database before the deploy.
ALTER TABLE bounties ADD COLUMN source TEXT NOT NULL DEFAULT 'posted';
ALTER TABLE bounties ADD COLUMN listed_by_id INTEGER;
ALTER TABLE bounties ADD COLUMN listed_by TEXT;
ALTER TABLE bounties ADD COLUMN issue_author TEXT;
