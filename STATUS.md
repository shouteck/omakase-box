# Status

Updated by the CTO on 31 October 2026, when BT48 closed.

## Now

- **BT48 is on master** (`4130e65`): never-ship judges a path by what it looks like. Invisible characters, width, composition and a small named table of look-alike letters are folded before every rule, `.boxignore` and never-publish match. The safe list folds case only. The table is a named set, not full Unicode coverage; limits are in the [wave file](waves/BT48.md).
- **Read the off-machine run at the next kickoff:** BT48 changed `bt43.test.ts`, and one of its tests now runs only there. BT45's run, the one its k16 gap relied on, was green.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders.

## Next

No wave is in flight or starts automatically.

- BT49, BT50, BT47 and BT46 on `packages/box-bounty`.
- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- PF1, then PF2 and PF3, then PF4, in separate sessions and worktrees if run alongside the tool waves.
- PF5 after BT49, BT50, PF2 and PF4.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
