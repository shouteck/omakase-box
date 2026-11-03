# Status

Updated by the CTO on 3 November 2026, when PF27 merged.

## Now

- **The solver side is built and proven** (CLI only; it reaches users with the next npm release, the owner's to publish): `discover` (PF24), `take` (PF25), `submit` and `status` (PF26), and `describe --solving` with the block's solving line (PF27). Three fresh agents on the sandbox: a JavaScript solver went from take to merged (#66), a Go solver's filter never showed the bounty. At $0 the solver first declined, as our own advice says; it took the bounty on the owner's trial word. See [PF27](waves/PF27.md).
- **PF27 fixed a poster-side defect the proof found:** after a review, `apply` merged the pull request's first version. It now merges nothing when the pull request moved, and names `look`.
- **PF27's For agents page is merged, not deployed** (the owner approved the look). Deploy needs the owner's word; read `exceededCpu` before and after.
- **The live board's bounty detail is slow:** 0.4 to 9 seconds this evening, against the tool's 2.5-second limit, so a solver's `status` often says "board: not read (it took too long)". The Worker waits 4 to 6 s with 20 ms of CPU; not its GitHub re-check. Not investigated (PF26, finding).
- **The solver side has no distribution roadmap past launch:** PF6 lists the tool where agents search, and nothing makes it the obvious choice for an agent that decides to earn. The owner is asking another session to study it.
- **PF28 is merged and deployed:** the board's reading can no longer stall. One bounty needing more GitHub reads than a run has (a squash-merged head, a long event chain) held every other bounty behind it, which is why the live board never saw PF25's sandbox draft. Migration and deploy on 3 November 2026; within about 15 minutes the live board had read all 27 bounties and stored PF25's draft. See [PF28](waves/PF28.md).
- **PF22 is live,** deployed on the owner's word on 3 November 2026 (Worker version `8ba6d7c0`), after `migrations/pf22.sql` on the live database. The board answers "new since" a bookmark, in the order it first listed each bounty, plus attempts in progress, the poster answering itself, and the owner's time to decide. It also fixes the off-machine test that had failed since PF21. See [PF22](waves/PF22.md).
- **The solver side is decided and split** (D-2026-11-03-solver-in-the-tool):
  - **Tuning in** lives in the solver.
  - **Whoever signed in with payment details,** and whose pull request is merged, is paid, person or agent.
  - **The tool serves both sides,** with solving off until the owner allows it.

  PF12 is retired into PF22 to PF27, sketched in [SOLVER-CLI.md](docs/box-v4/SOLVER-CLI.md), after K47's critique ([SOLVER-SIDE.md](docs/box-v4/SOLVER-SIDE.md), merged `6ef8ce92`).
- **PF21 is live,** deployed on the owner's word on 3 November 2026 (Worker version `2605d119`; no migration): Your bounties on the Owner side. Every bounty the owner's GitHub account opened, in four stages (Waiting for solutions, Solutions in, Payment due, Paid) plus Closed. It replaces the "You owe" figure and the "To pay" table. Payment due holds only what waits on the owner; pay on merge goes straight to Paid. See [PF21](waves/PF21.md).
- **PF20 is live,** deployed on the owner's word on 3 November 2026 (Worker version `225e9f5d`): the CLI's pay-on-merge lines read the new public answer (checked live: `set_up` true, no one on yet; a bad name gets 400); one fixed "Reward"; repositories from the owner's own bounties; removing the card confirmed. See [PF20](waves/PF20.md).
- **PF19 is live,** deployed on the owner's word on 3 November 2026 (Worker version `6cd916d0`), after `migrations/pf19.sql` on the live database (no repository was on pay on merge yet, so nothing was copied): Your page by role, pay on merge per repository, Stripe's countries readable signed out. See [PF19](waves/PF19.md).
- **Stripe is live on the board** since 3 November 2026 (Worker `36945f44`, PF18): One click and On merge real; solver accounts through Accounts v2 on the full secret key with a Cloudflare-only access policy; the live checks paying nothing passed (see [PF18](waves/PF18.md)). **No real payment has been made:** the first one is the proof this has not had; read it from the logs when it happens. To turn it off: `wrangler secret delete STRIPE_SECRET_KEY`.
- **Optional for the owner:** ask Stripe's support whether a restricted key can get Write on Accounts v2; if so, swap the secret.
- **PF16, PF17, PF15 are live** (Worker `bac9a44a`, `5a246140`, `d014ce4d`): the install `npx -y omakase-box setup`, `omakase-box@0.1.3` on npm; one command window; the three ways in the tool, feed, MCP and front page. **PF14, PF13, PF11 are live with no key:** one click and on merge say "not set up".
- **PayPal's review:** Log in with PayPal saved on the live app, omakase-box, on 2 November 2026; the answer is awaited. No PayPal key until it passes. PayPal live is unproven (real webhook delivery; Cloudflare's cron re-read; whether the Business account needs a registered business).
- **PF8 and PF10 are live:** https://open-bounty-board.box-platform.workers.dev, at $0, with real sign-in.
- **For PF9:** the CPU of `settlePayPal`, the payments-due notice and `exceededCpu` on the free plan; PayPal's connect on a deployed board; a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board; one later session end to end from `box setup`. Wrangler's login is on this machine; `wrangler logout` ends that.
- **Read the off-machine run at the next kickoff:** it covers PF18's merge.
- **Branches (owner, 31 October 2026):** work closes onto master. `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner, cleanup:**
  - PF18's test objects in "shoutecknik sandbox" (45 test accounts, customers, one webhook): the access policy blocks this machine, so either take the policy off that sandbox's key for a cleanup run, or delete the sandbox. Then the bench `%TEMP%\kitchen-PF18-bench` goes.
  - The user variables `STRIPE_TEST_SANDBOX_KEY`, `STRIPE_TEST_RESTRICTED_KEY` and `STRIPE_TEST_KEY`, and the `kitchen-pf18` restricted keys in both sandboxes; roll the sandbox secret keys.
  - PayPal's sandbox secret, pasted in the PF13 session's chat: regenerate it, and remove the six `PAYPAL_SANDBOX_*` variables when done.
  - The private `shouteck/kitchen-PF8-private`; the stray `node.exe` from BT44 (PID 16324) and a `bench.mjs` from `%TEMP%\kitchen-PF13-paypal` (PID 472568), if still running.
  - The participant sessions of BT42, BT52, PF2, PF7, PF8, PF15 and PF16 and their `%TEMP%` folders (`kitchen-BT52-proof`, `kitchen-PF2-*`, `kitchen-PF7-*`, `kitchen-PF8-reader`, `kitchen-PF15`, `kitchen-PF16*`); six empty `%TEMP%\kitchen-K43-*` folders.

## Next

- **PF23 (needs) is deferred** (owner, 3 November 2026): the task text says what it needs; back if real bounties show the need.
- **Order:** **PF9** (the launch gate), **PF6** (ready to launch; the listings for both sides, PF12b folded in), **K41** (the film, last), then the owner's launch.
- **The next tool release:** the guide inside the package gains the PowerShell line (`npx.cmd`, `box.cmd`); a new version goes to npm by the owner, and to GitHub by a `v*` tag.
- **A wave for later, not briefed:** fewer words, more showing, across the site, before PF9.
- Unbriefed (BACKLOG): `rmSync` and non-ASCII names on Windows (BT48); the dependency audit (PF1); landed but not marked merged, solvers' account age (PF4); a private organisation member counts as an outside solver, a squash-merged head reads as off the default branch (PF8); PF18's leftovers.
- **Direction (owner, 2 November 2026):** agents run the common case; installing is the only required human step. **Payment (1 November):** the platform may start a charge but never holds money; $0 for the owner; no reminders. **Supply (1 November):** the board grows into the solver's distributor. **Site looks (2 November):** before-and-after screenshots and the owner's approval before a look change merges.
- **Verify on a cloud host:** k16 needs the pinned browser (BACKLOG). **On the Windows host:** run verify from Git Bash with heavy apps closed.
