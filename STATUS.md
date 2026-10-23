# Status

Updated by the CTO on 23 October 2026, when BT43 closed.

## Now

- **BT43 merged** (`6cefe00`), and on master through shouteck/omakase-box#9 (`2143821`).
  - The bounty command's output passes one guard that escapes every control character. Refusals print as one line. `look` frames solver text in one labelled block. `look --export` writes the diff under `.box/local/solutions/` and prints only path and hash. `--json` marks solver fields. Every printed path and commit subject is quoted.
  - The owner amended the Outcome to those guarantees (`D-2026-10-23-bt43-outcome`). Accepted on the sixth pass (PASS, test-verified, `c1d2b52`), after five FAILs, two parks and two owner "go"s.
  - Host limit: this run used a Linux cloud container (Node 22.22.0, git 2.43). k16 ran on the host's Chromium 1194 linked in as revision 1243. The off-machine run on master is the first on the real revision.
- **Off-machine:** the run on `2143821` (BT43's merge to master) was queued at close and is not yet read. It is the first k16 run on the real Chromium revision. Read it at the next kickoff; if it is red, the next wave is the fix.
- **For the owner** (from BT42/BT44 on the Windows host, unchanged): the stray idle `node.exe` (PID 16324); the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders.
- **New in BACKLOG:** pass 6's seven items under BT43, among them the scan's misread of quoted git headers and the docs overstating what the guard alone guarantees.

## Next

This run stops after BT43. No wave is in flight or starts automatically.

- BT45, BT48, BT49, BT50, BT47 and BT46 on `packages/box-bounty`.
- PF1, then PF2 and PF3, then PF4, in parallel worktrees.
- PF5 after BT43, BT49 and BT50.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **Verify on this host:** the bounty suite's 30 s timeouts fail under load (BACKLOG); run verify with heavy apps closed.
