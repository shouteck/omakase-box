# Truth key — bt-aa11bb22cc33 (written before the participant ran)

1. why: "startup crash blocks the release; tried node app.txt locally
   and the failure is in startup"
2. task: repair the app so it starts (title: "Repair app startup crash";
   the task text is searchable via `box bounty find` but not rendered — a
   correct answer names the startup crash, not the file contents)
3. partOf: "release-42 readiness"; followup: "release-42 waits on this;
   resume on branch release-42 after the fix lands"
4. outcome: one solution submitted (n=1, PR #3 by solver-mq, commit
   cccccccccccccccccccccccccccccccccccccccc), then the bounty was closed as withdrawn — "owner
   fixed it in the meantime"
5. shared-only refusal: look/apply/close refuse "shared-only" — the
   bounty was posted from another machine; its issue is
   https://github.com/owner/project/issues/7; act on it from that
   machine, or on GitHub. No record is created, nothing is written.
6. clone invisibility: `git log --all` shows only the init commit and
   `git grep` finds nothing of the chain — the memory lives in refs no
   ordinary clone downloads, not in files.
7. offline (after >60 s): `box.cmd status` still shows the bounty
   (ended: withdrawn) and prints exactly once per spell:
   "shared bounty memory not refreshed (<reason>); showing what this
   machine last saw"
