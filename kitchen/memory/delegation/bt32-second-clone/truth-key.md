Scoring key for the second-clone participant (BT32). Expected facts:
1. Status lists the shared bounty after `box bounty` syncs; stage matches the
   last valid event (posted -> collected/applied/withdrawn per fixture).
2. Acting (answer/apply/close) on a shared-only bounty is refused: the tool
   states a local record is required. Refusal is the correct answer.
3. Offline: status still answers from the local cache and states the data is
   stale/not refreshed (sync notice), never silently claims freshness.
4. Shared state lives in refs/box-bounty/<id> + the local cache; it is absent
   from branch history, the worktree and `git grep`. Bonus: `git ls-remote`
   shows it on origin but a default clone does not fetch it.
Any claim that shared rows are writable, that drafts left the machine, or that
reads created shared writes is a fail.
