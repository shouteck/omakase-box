# Status

Updated by the CTO on 23 October 2026, when BT42 closed.

## Now

- **BT42 merged** (`3d140ef`). The block an agent sees says, in constant words, that posting is free, goes only to this repository's own public GitHub as an issue, and falls under the owner's standing permission (`box bounty config`).
  - Independent PASS (test-verified) on `796244e`.
  - Fresh-agent check: Haiku 5.5 on the new block got cost, destination and permission right. Sonnet 5.5 on the old block guessed "probably costs money".
  - This repository's own `AGENTS.md` block is refreshed to match.
- **BT44 merged** (`2cc13d4`). A bounty counts as merged only when its solution is new to the branch and descends from the posted commit.
- **Off-machine:** green on the BT44 close (`7d0d4ab`). The BT42 merge push is not yet read.
- **For the owner:**
  - The stray idle `node.exe` (PID 16324, parent `bash.exe` 17672) from the BT44 pass is still there. Ending it is your call.
  - Archive the two BT42 participant sessions when you like; then their `%TEMP%\kitchen-BT42-participant-*` folders can go.
  - Six empty `%TEMP%\kitchen-K43-*` folders likewise wait on their sessions.
- **New in BACKLOG:**
  - a stranger's PR can claim a commit the owner pushed after the post (BT44 pass);
  - bounty wording after BT42 ("a bounty has a cost"; "always your call" read as "no need to ask").

## Next

This run stops after BT42. No wave is in flight or starts automatically.

- BT43, BT45, BT48, BT49, BT50, BT47 and BT46 on `packages/box-bounty`.
- PF1, then PF2 and PF3, then PF4, in parallel worktrees.
- PF5 after BT43, BT49 and BT50.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **Verify on this host:** the bounty suite's 30 s timeouts fail under load (BACKLOG); run verify with heavy apps closed.
