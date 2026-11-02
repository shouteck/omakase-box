# Status

Updated by the CTO on 3 November 2026, when PF18 merged.

## Now

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

- **Order:** PF18 live, **PF19** (the signed-in page redesign, owner, 2 November 2026; unbriefed; references are big companies' design systems), **PF12** (the solver's distributor; linking a solver's existing Stripe account is a question for it), **PF9** (the launch gate), **PF6**, **K41** (the film, last), then the owner's launch.
- **The next tool release:** the guide inside the package gains the PowerShell line (`npx.cmd`, `box.cmd`); a new version goes to npm by the owner, and to GitHub by a `v*` tag.
- **A wave for later, not briefed:** fewer words, more showing, across the site, before PF9.
- Unbriefed (BACKLOG): `rmSync` and non-ASCII names on Windows (BT48); the dependency audit (PF1); landed but not marked merged, solvers' account age (PF4); a private organisation member counts as an outside solver, a squash-merged head reads as off the default branch (PF8); PF18's leftovers.
- **Direction (owner, 2 November 2026):** agents run the common case; installing is the only required human step. **Payment (1 November):** the platform may start a charge but never holds money; $0 for the owner; no reminders. **Supply (1 November):** the board grows into the solver's distributor. **Site looks (2 November):** before-and-after screenshots and the owner's approval before a look change merges.
- **Verify on a cloud host:** k16 needs the pinned browser (BACKLOG). **On the Windows host:** run verify from Git Bash with heavy apps closed.
