# Status

Updated by the CTO on 22 October 2026, when BT44 was parked.

## Now

- **BT44 parked** on `wave/BT44` (`ea4eab5`). It is not merged.
  - The pass found no correction to make: the change does what the brief says, and its tests fail when the guard is broken.
  - No verify has been green on `e6ef820`: three runs each timed out a different few tests at 30 s, in files BT44 does not touch.
  - The blocker is the environment (BACKLOG "Bounty suite under load"). **Waiting on the owner:** whether a kitchen wave fixes it.
- **BT42 not started.** Its verify would hit the same timeouts. Its fresh-agent check also needs participant sessions started from an owner turn.
- **Staffing:** on 22 October the owner moved BT44 and BT42 from OpenCode to Claude Code. Both briefs say so.
- **Off-machine:** master is green at `bde237b`. The red at `3b1ab15` (the 20 KB rule) was fixed in `bb599b9`.
- **New in BACKLOG from the BT44 pass:** a stranger's PR can claim a commit the owner pushed after the post. This existed before BT44.

## Next

- **On the owner's word:** a kitchen wave for the bounty suite's 30 s margin. Then one verify on `wave/BT44` and its merge, then BT42.
- **Afterwards, as before:**
  - BT43, BT45, BT48, BT49, BT50, BT47 and BT46 on `packages/box-bounty`;
  - PF1, then PF2 and PF3, then PF4 in parallel worktrees;
  - PF5 after BT43, BT49 and BT50;
  - K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **See the prototype:** `cd kitchen/platform-prototype && npm start`, then http://localhost:4310/.
