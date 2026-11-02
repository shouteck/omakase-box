# Status

Updated by the CTO on 2 November 2026, when PF17 closed.

## Now

- **PF17 is live,** deployed on the owner's word on 2 November 2026 (Worker version `5a246140`): one command window on How it works, fewer links, no `/#pay`. See [PF17](waves/PF17.md).
- **PF15 is live,** deployed on the owner's word on 2 November 2026 (Worker version `d014ce4d`). The live board reads `one_click: []`, `on_merge: false` and shows no open bounties yet. See [PF15](waves/PF15.md).
- **On the board and master:** the three ways to pay in the tool, feed, MCP and front page; How it works where installing is the only human step; setup text in `box bounty`; a payments-due notice on the board; an unasked `status` says nothing of what is owed; `box` a real command from the install.
- **PF14 and PF13 are live, with no Stripe or PayPal key:** the one-click code says "not set up" until a key is set. Stripe proven in test mode, PayPal in its sandbox, each end to end.
- **PayPal's review:** the owner saved Log in with PayPal on the live app, omakase-box, on 2 November 2026. PayPal's answer is awaited. No key goes on the board until it passes.
- **PayPal live is unproven:** real webhook delivery; Cloudflare's cron running the re-read; whether the Business account needs a registered business; whether PayPal's review accepts this use. Reach is unsettled for 11 of the 14 countries Stripe refused.
- **PF11 is live with no Stripe key.** Payment stays manual until the owner sets a live key; real payments are the owner's.
- **PF8 and PF10 are live:** the board at https://open-bounty-board.box-platform.workers.dev, at $0, with real sign-in. The CLI's default board is that address.
- **For PF9:**
  - read the CPU of `settlePayPal` and of the payments-due notice, and `exceededCpu`, on the free plan (a hint's look and the busiest refreshes already pass 10 ms: BACKLOG);
  - run PayPal's connect on a deployed board;
  - a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board; run `box bounty config set board <address>` there;
  - prove one later session end to end: it finds the tool from the instruction block and runs `box`;
  - Wrangler's login is on this machine, so the CTO can redeploy and read logs; `wrangler logout` ends that.
- **Read the off-machine run at the next kickoff:** it covers PF15's merge.
- **Branches (owner, 31 October 2026):** work closes onto master. The cloud session branch `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner:**
  - keep the Stripe test key and PayPal's sandbox app for PF9, or revoke them; PayPal's sandbox secret and test passwords were pasted in the PF13 session's chat, so regenerate the secret, and remove the six `PAYPAL_SANDBOX_*` variables when done;
  - delete the private `shouteck/kitchen-PF8-private`; its issue is closed and `gh` has no delete scope here;
  - the stray idle `node.exe` from BT44 (PID 16324), if it is still running;
  - the participant sessions of BT42, BT52, PF2, PF7, PF8 and now PF15 (`pf15-owner-reader`, `pf15-solver-reader`), and their `%TEMP%` folders, held open until the sessions are archived: `kitchen-BT52-proof`, `kitchen-PF2-*`, `kitchen-PF7-owner` and `-solver`, `kitchen-PF8-reader`, `kitchen-PF15`; six empty `%TEMP%\kitchen-K43-*` folders.

## Next

- **Decision for the owner:** say "go" on PF16.
- **Order:** **PF16** (one line to install: a GitHub release, npm ready for the owner; brief awaits "go"), **PF12** (the solver's distributor), **PF9** (the launch gate), **PF6** (with the toolbox work), **K41** (the film, last, D-2026-11-01-film-and-launch-last), then the owner's launch.
- **A wave for later, not briefed:** fewer words, more showing, across the site, before PF9.
- Unbriefed, found in BT48 (BACKLOG): `rmSync` leaves non-ASCII names on Windows, which may leave a solver's file behind after a refused `apply`.
- Unbriefed, found in PF1 (BACKLOG): the dependency audit. PF2 added the MCP SDK's dev packages, unaudited.
- Unbriefed, left by PF4 (BACKLOG): landed but not marked merged; solvers' account age.
- Found in PF8 (BACKLOG): a private organisation member counts as an outside solver; a squash-merged head reads as not on the default branch.
- **Direction (owner, 2 November 2026, D-2026-11-02-install-is-the-human-step):** the common case is run entirely by agents; installing is the only required human step; add no new friction. **(1 November, D-2026-11-01-agent-only-direction):** judge for long-running agents; reach both sides through the toolboxes agents search.
- **Payment (owner, 1 November 2026, D-2026-11-01-pay-on-merge):** the platform may start a charge but never holds money; $0 for the owner throughout; no reminders (D-2026-11-02-no-owed-reminders).
- **Supply (owner, 1 November 2026, D-2026-11-01-solver-distributor):** the board grows into the solver's distributor and lists only our own bounties.
- **Site looks (owner, 2 November 2026):** any change to how the website looks needs the owner's approval from before-and-after screenshots, before it merges.
- **Verify on a cloud host:** k16 cannot run without the pinned browser (BACKLOG, "Cloud-host browser route"). **On the Windows host:** the bounty suite's 30 s timeouts fail under load (BACKLOG), so run verify with heavy apps closed.
