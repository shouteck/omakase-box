# Status

Updated by the CTO on 23 October 2026, when BT43 parked.

## Now

- **BT43 parked** on its fourth FAIL, under the stop rule its Correction 3 set. Not merged.
  - Built and holding: one output guard escapes every control character the bounty command writes; refusals print as one line; `look` frames solver text in one labelled block; `look --export`; `--json` marks solver fields.
  - Open, both small: a solver's commit subject prints unmarked in apply's conflict list (`answer.ts:339`), and a lone CR in owner text previews as `\r`.
  - **The code exists only in this cloud container** (branch `wave/BT43`, tip `8328c88`). It is lost when the container is reclaimed unless the owner lets the kitchen push that branch.
  - The wave file with all four verdicts is committed here (`waves/BT43.md`).
- **Host:** this run used a Linux cloud container (Node 22.22.0, not 24.11.0). k16 ran on the host's Chromium 1194 dressed as revision 1243 (symlinks in `.runtime/browsers/`, kept for a resume).
- **Off-machine:** green on `1a2100b`. This run pushed only kitchen documents to `claude/dreamy-turing-gmf4pa`, not master.
- **For the owner** (from BT42/BT44 on the Windows host, unchanged): the stray idle `node.exe` (PID 16324); the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders.

## Next

This run stops after BT43. BT43 is parked; only the head chef resumes it, with a fresh cook for the two open findings, then a pass.

- BT45, BT48, BT49, BT50, BT47 and BT46 on `packages/box-bounty`.
- PF1, then PF2 and PF3, then PF4, in parallel worktrees.
- PF5 after BT43, BT49 and BT50.
- K41 after PF5, PF6 last.
- **brief-check:** PF2–PF6 name `test:platform`, which PF1 creates. Re-check them after PF1.
- **Verify on this host:** the bounty suite's 30 s timeouts fail under load (BACKLOG); run verify with heavy apps closed.
