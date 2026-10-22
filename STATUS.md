# Status

Updated by the CTO on 22 October 2026, when BT44 closed.

## Now

- **BT44 merged** (`2cc13d4`). A bounty now counts as merged only when its solution is new to the branch and descends from the posted commit. A PR pointing at an existing commit leaves the bounty open, with no notice and no pay message.
  - Independent PASS (test-verified) on `ea4eab5`: `verify ea4eab5 PASS … 876s`, on a quiet host.
  - Three earlier runs went red only on 30 s timeouts while the host was busy (BACKLOG "Bounty suite under load").
- **BT42 next.** The owner lifted the hold on 22 October. It is staffed on Claude Code, and its fresh-agent check needs participant sessions started from an owner turn.
- **Off-machine:** green at `bde237b`. The run on `0725b62` was cancelled after 18 min; the merge push is not yet read.
- **Stray process for the owner:** an idle `node.exe` (PID 16324, parent `bash.exe` 17672) left by the BT44 pass's mis-quoted shell command. Ending it is the owner's call.
- **From the BT44 pass, in BACKLOG:** a stranger's PR can claim a commit the owner pushed after the post.

## Next

- BT42, then BT43, BT45, BT48, BT49, BT50, BT47 and BT46 on `packages/box-bounty`.
- PF1, then PF2 and PF3, then PF4, in parallel worktrees.
- PF5 after BT43, BT49 and BT50.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
