# Status

Updated by the CTO on 31 October 2026, when PF1 closed.

## Now

- **PF1 is on master** (`d3008b0`): the board and bounty pages run locally with `node packages/box-platform/local.mjs`, against a GitHub stand-in. See the [wave file](waves/PF1.md).
- **Before any deploy (BACKLOG, Product):** no read has met real GitHub, and a refresh tick may exceed Workers Free's 10 ms CPU. Both belong to PF6.
- **Read the off-machine run at the next kickoff:** BT46's worker has not yet run on Node 22.13 or Linux.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit.
- PF2 and PF3, then PF4, in separate sessions and worktrees if run alongside the tool waves. Reconcile each with PF1's `/api/*` names.
- PF5 after BT49, BT50, PF2 and PF4.
- K41 after PF5, PF6 last.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
