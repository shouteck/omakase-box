-- PF29: what GitHub's checks said on each open attempt's head. Run once on a board deployed before PF29, before deploying it.
-- Every open attempt starts unread, so the refresh reads each in turn, stalest first, within its budget.
ALTER TABLE pull_requests ADD COLUMN checks_state TEXT;
ALTER TABLE pull_requests ADD COLUMN checks_sha TEXT;
ALTER TABLE pull_requests ADD COLUMN checks_read_at INTEGER NOT NULL DEFAULT 0;
