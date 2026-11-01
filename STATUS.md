# Status

Updated by the CTO on 1 November 2026, when PF11 was parked.

## Now

- **Payment stays manual (owner, D-2026-11-01-manual-payment-for-now).** The owner pays through the solver's payment link, as today. The owner stopped at Stripe's identity check, so the live account is unfinished. **PF11 is parked:** its unfinished, unverified work is on the local branch `wave/PF11` (`0aad943`), never deployed or merged; the live board did not change.
- **K46 is on master: pay on merge works in Stripe's test mode at a platform cost of $0.** See the [report](docs/box-v4/PAY-ON-MERGE.md). It stays unbuilt.
- **PF10 is live: the redesigned site.** Its two fresh-visitor checks did not run; PF9's seats are the first fresh eyes.
- **PF8 is live: the board** at https://open-bounty-board.box-platform.workers.dev, at $0, reading real GitHub, with real sign-in. The CLI's default board is that address.
- **CPU on Workers Free:** Cloudflare stopped no run, but a hint's look (median 17 ms) and the busiest refreshes (max 17) still pass 10 ms (BACKLOG). PF9 reads `exceededCpu` as it goes.
- **For PF9:** a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board; run `box bounty config set board <address>` there. Wrangler's login is on this machine, so the CTO can redeploy and read logs; `wrangler logout` ends that.
- **Read the off-machine run at the next kickoff:** it covers K46's merge.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - revoke the Stripe test key and remove `STRIPE_TEST_KEY`: nothing needs them now;
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
- **Supply (owner, 1 November 2026, D-2026-11-01-solver-distributor):** the board grows into the solver's distributor and lists only our own bounties.
- **Order:** **PF12** next (the solver's distributor, now with "agents welcome" and the first facts), **PF9** (the launch gate), **PF6** (with the toolbox work), **K41** (the film, last, D-2026-11-01-film-and-launch-last), then the owner's launch.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
