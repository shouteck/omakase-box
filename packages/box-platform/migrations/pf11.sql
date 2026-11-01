-- PF11, for a board that already has a database: CREATE TABLE IF NOT EXISTS adds no column
-- to a table that exists. Run once, before schema.sql and before deploying the new code.
ALTER TABLE bounties ADD COLUMN poster_id INTEGER;
ALTER TABLE pull_requests ADD COLUMN author_id INTEGER;
