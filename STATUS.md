# Status

Updated by the CTO on 1 November 2026, when BT52 closed.

## Now

- **BT52 is on master:** a fresh clone with its own settings can see a bounty's waiting pull requests, `look`, and `apply` or `close` it, once GitHub's issue agrees with the shared record. Proven in the sandbox by a fresh session. New `--resume` notes stay off the chain; ones already pushed stay public. Limits and the name collision between the chain and the bounty branch are in BACKLOG. See the [wave file](waves/BT52.md).
- **Read the off-machine run at the next kickoff:** it covers BT52's merge. BT51-ci and BT51-ci2 turned it green before that.
- **BT51 is on master:** after `apply` or a recognised hand merge, GitHub marks the chosen pull request merged, proven in the sandbox. The solver counts once the owner pushes their branch. Not proven: a pull request from a fork (BACKLOG). A hand squash merge is not recognised (BACKLOG). See the [wave file](waves/BT51.md).
- **PF5 is on master:** a bounty reaches the board moments after `post`; the owner's pay message names the solver's accepted methods; `status` says what the board shows; no new command or credential. The address is empty, so every call is off, until PF8 sets it. Local only, against stand-ins. See the [wave file](waves/PF5.md).
- **Before any deploy (BACKLOG, Product):** no read has met real GitHub, including how a private organisation member is reported; a refresh tick, a hint's look and the `owner_record` filter may exceed Workers Free's 10 ms CPU; sign-in has not met real GitHub OAuth. The owner's app steps are in `packages/box-platform/README.md`. All belong to PF8.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders;
  - the BT52 participant session and `%TEMP%\kitchen-BT52-proof`, held open until the session is archived;
  - the two PF2 fresh-agent sessions and their `%TEMP%\kitchen-PF2-*` folders, held open until the sessions are archived.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit. PF2 added the MCP SDK's dev packages, unaudited.
- Unbriefed, left by PF4 (BACKLOG): landed but not marked merged; solvers' account age. The "you owe" list is in PF7.
- **Order (owner, 1 November 2026, D-2026-11-01-real-before-launch):** **PF7** next, then, **PF8**, **PF9** (the launch gate), then **K41** and **PF6**, then the owner's launch.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
