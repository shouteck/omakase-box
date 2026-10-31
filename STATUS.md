# Status

Updated by the CTO on 1 November 2026, when BT51-ci2 closed.

## Now

- **The off-machine run has been red since BT51's close; BT51-ci and BT51-ci2 are the fixes, on master.** Four Linux failures from the tests, then one timing fault in `close.ts` behind them. No budget moved. Proven on Windows only: **read the run on this status commit at the next kickoff; if red, the next wave is the fix.** See [BT51-ci](waves/BT51-ci.md) and [BT51-ci2](waves/BT51-ci2.md).
- **BT52 is parked on `wave/BT52`:** built, tested in part, not verified. What is left is in [its wave file](waves/BT52.md). Merge master into it first.
- **BT51 is on master:** after `apply` or a recognised hand merge, GitHub marks the chosen pull request merged, proven in the sandbox. The solver counts once the owner pushes their branch. Not proven: a pull request from a fork (BACKLOG). A hand squash merge is not recognised (BACKLOG). See the [wave file](waves/BT51.md).
- **PF5 is on master:** a bounty reaches the board moments after `post`; the owner's pay message names the solver's accepted methods; `status` says what the board shows; no new command or credential. The address is empty, so every call is off, until PF8 sets it. Local only, against stand-ins. See the [wave file](waves/PF5.md).
- **Before any deploy (BACKLOG, Product):** no read has met real GitHub, including how a private organisation member is reported; a refresh tick, a hint's look and the `owner_record` filter may exceed Workers Free's 10 ms CPU; sign-in has not met real GitHub OAuth. The owner's app steps are in `packages/box-platform/README.md`. All belong to PF8.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders;
  - the two PF2 fresh-agent sessions and their `%TEMP%\kitchen-PF2-*` folders, held open until the sessions are archived.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit. PF2 added the MCP SDK's dev packages, unaudited.
- Unbriefed, left by PF4 (BACKLOG): landed but not marked merged; solvers' account age. The "you owe" list is in PF7.
- **Order (owner, 1 November 2026, D-2026-11-01-real-before-launch):** **BT52** next (parked, see above), then **PF7**, **PF8**, **PF9** (the launch gate), then **K41** and **PF6**, then the owner's launch.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
