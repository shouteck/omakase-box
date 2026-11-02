-- PF19: a limit per repository. Run once on a board deployed before PF19, before deploying it.
-- Each repository already on takes its owner's one limit, so nothing an owner set changes.
ALTER TABLE pay_repositories ADD COLUMN limit_per_bounty INTEGER;
UPDATE pay_repositories SET limit_per_bounty = (SELECT s.limit_per_bounty FROM pay_settings s WHERE s.github_id = pay_repositories.github_id) WHERE limit_per_bounty IS NULL;
