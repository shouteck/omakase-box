# Status

Updated by the CTO on 1 November 2026, when K46 closed.

## Now

- **K46 is on master: pay on merge works in Stripe's test mode at a platform cost of $0.** See the [report](docs/box-v4/PAY-ON-MERGE.md). Two things are unproven: a charge on a fully activated account in the $0 setup, which needs a person to accept Stripe's terms; and whether Stripe accepts an unregistered individual as a live platform. If it wants a registration, that is S$115 and a named blocker.
- **PF10 is live: the redesigned site.** Its two fresh-visitor checks did not run; PF9's seats are the first fresh eyes.
- **PF8 is live: the board** at https://open-bounty-board.box-platform.workers.dev, at $0, reading real GitHub, with real sign-in. The CLI's default board is that address.
- **CPU on Workers Free:** Cloudflare stopped no run, but a hint's look (median 17 ms) and the busiest refreshes (max 17) still pass 10 ms (BACKLOG). PF9 reads `exceededCpu` as it goes.
- **For PF9:** a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board; run `box bounty config set board <address>` there. Wrangler's login is on this machine, so the CTO can redeploy and read logs; `wrangler logout` ends that.
- **Read the off-machine run at the next kickoff:** it covers K46's merge.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - revoke the Stripe test key and remove `STRIPE_TEST_KEY` once PF11 no longer needs it; PF11 may reuse the sandbox;
  - delete the private `shouteck/kitchen-PF8-private`; its issue is closed and `gh` has no delete scope here;
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the BT42 participant sessions and their `%TEMP%` folders; six empty `%TEMP%\kitchen-K43-*` folders;
  - the BT52 participant session and `%TEMP%\kitchen-BT52-proof`, held open until the session is archived;
  - the two PF2 fresh-agent sessions and their `%TEMP%\kitchen-PF2-*` folders, held open until the sessions are archived;
  - the two PF7 reader sessions and `%TEMP%\kitchen-PF7-owner` and `-solver`, held open until the sessions are archived;
  - the PF8 reader session and `%TEMP%\kitchen-PF8-reader`.

## Next

- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit. PF2 added the MCP SDK's dev packages, unaudited.
- Unbriefed, left by PF4 (BACKLOG): landed but not marked merged; solvers' account age.
- Found in PF8 (BACKLOG): a private organisation member counts as an outside solver; a squash-merged head reads as not on the default branch.
- **Direction (owner, 1 November 2026, D-2026-11-01-agent-only-direction):** agent-only end to end as an option, guard rails the default; judge for long-running agents; reach both sides through the toolboxes agents search.
- **Payment (owner, 1 November 2026, D-2026-11-01-pay-on-merge):** the platform may start a charge but never holds money; $0 for the owner throughout; no reminders.
- **Supply (owner, 1 November 2026, D-2026-11-01-solver-distributor):** the board grows into the solver's distributor and lists only our own bounties.
- **Order:** **PF11** next (brief it from K46's outline; opens with the two unproven checks), then **PF12** (the solver's distributor), **PF9** (the launch gate), **PF6** (with the toolbox work), **K41** (the film, last, D-2026-11-01-film-and-launch-last), then the owner's launch.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
