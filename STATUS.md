# Status

Updated by the CTO on 11 November 2026, when BT63 was parked at its first step.

## Now

- **BT63 is parked on `wave/BT63`** (`376b24a1`; **owner answered 11 November 2026: ship without `box`**, D-2026-11-11-drop-box-command); it resumes now, without the old-name notice. See [BT63](waves/BT63.md).

- **K58 is merged:** master's hosted run had been red on every run since the BT64 merge (9 runs), on one platform page test, not on BT64: the fixtures are dated from a fixed 31 October while the page works out ages with the real clock, so "4 days ago" became "2 weeks ago" on 10 November. The test browser now has the fixtures' clock. **Read the hosted run on the merge at the next kickoff;** it should be green. See [K58](waves/K58.md).
- **BT63 (the rename) is in progress on its branch** (resumed 11 November 2026).

- **BT64 is merged:** a never-publish entry now holds however the repository folder is spelled. Before, an 8.3 short name or **just a different letter case** of the folder made the owner's list miss, and the listed path shipped. `packages/box-bounty/folder.ts` gives the folder one spelling; older stored keys are read by folder, so nothing an owner set is lost; a test fails on any new `realpathSync` outside it. Proven on this host (local verify, the rule in force). The likely cause of K50's macOS miss of `apply-unsafe-config` is fixed too, **unproven until K50's macOS run**. Reaches users with the next npm release. See [BT64](waves/BT64.md).
- **K50 is parked** on `wave/K50` (`5a2fd5e1`, pushed) at step 3 of its plan, every job of its first run recorded in [K50](waves/K50.md). Resume next: rebase on master (BT64), rerun on three systems. Known open: a second high advisory (`source-map-js`, through the board's `next`) needs a brief edit; `bt18` and `bt22` compute their expected key with JavaScript `realpathSync`, which fails only under a short temp folder (GitHub's Windows), and changing that is an expectation edit to decide with a reason.

- **K57 is merged:** master's hosted run was red from the K48 brief (runs 42743732293 to 42750108726), on kitchen documents only. STATUS.md's length and K48's unanswered question were fixed at kickoff; the sandbox guard now reads `omakase-box` alone as the product and `shouteck/omakase-box` or "on omakase-box" as the repository. **Read the hosted run on the merge at the next kickoff;** it should be green. See [K57](waves/K57.md).

- **One name and one command (owner, 10 November 2026):** the product is omakase-box, on the site, the package and the tool; the command becomes `omakase-box` and drops "bounty", because Box's official tool already owns the command `box` ([BT63](waves/BT63.md), **has the owner's go, runs first**; in the first release, immediately before BT53; `box bounty` kept for one release).

- **Every waiting brief now says how, step by step** (owner, 10 November 2026: later waves may be cooked by a lower-reasoning model). Each of the 25 has "Steps, in order", a table of tests to write first, the traps, and exactly which test expectations the owner's decision changes. Two brief errors were corrected from the code: the watching line is pinned by `github.test.ts`, not `bt41`; the front page's blank picture is CSS (`opacity: 0` in `rise`), not a script.

- **The site's design is approved and briefed** (owner, 11 November 2026, D-2026-11-11-design-approved): the current design stays; four small waves **await the owner's go**: [PF40](waves/PF40.md) (top bar: mark A, the name, one action), [PF43](waves/PF43.md) (front page: install line, a third way in, nothing hidden while it waits), [PF41](waves/PF41.md) (the empty board), [PF42](waves/PF42.md) (How it works: with the tool or without it). Each builds to a picture made by `docs/box-v4/design/review.mjs`. K56's first review was wrong about "two sites"; see its correction.

- **K55, what successful agent tools do** (no code changed): two gaps, a refusal under `--json` is still a sentence and only four commands take `--json` ([BT61](waves/BT61.md), **awaits the owner's go**). The owner answered (D-2026-11-10-k55-answers): no standing agent evaluation, no fee stated in advance, no new install routes; no 1.0 promise until after real use, with the surface recorded now ([BT62](waves/BT62.md), awaits the owner's go).

- **Owner decisions in talk, 10 November 2026:** from going live, no bounty is posted or listed at $0 ([BT60](waves/BT60.md), **awaits the owner's go**, D-2026-11-10-no-zero-bounties). Nothing is charged until there is sensible volume (D-2026-11-10-revenue-later). The project still spends nothing.

- **K53, tooling, architecture and language** (no code changed): keep TypeScript on Node. A bounty's page, the board and the numbers page are empty without JavaScript ([PF39](waves/PF39.md)); no linter ([K54](waves/K54.md)). Both **await the owner's go**. See [K53](waves/K53.md).

- **K49, the engineering reviewed** (no code changed): the tool is fast and sound. The board has no backup, rollback, migration record or watch, and no security headers. Verify takes about 5 minutes on GitHub's machine and 20 to 31 here, and runs there only after a merge, on Linux only. Briefs **awaiting the owner's go**: [BT58](waves/BT58.md), [K50](waves/K50.md), [PF36](waves/PF36.md), [PF37](waves/PF37.md), [PF38](waves/PF38.md), [K51](waves/K51.md), [BT59](waves/BT59.md), [K52](waves/K52.md) (a removal). See [K49](waves/K49.md).

- **K48, the product reviewed** (no code changed): **npm still serves 0.1.3, from before the solver side.** Briefs **awaiting the owner's go**: [BT54](waves/BT54.md) (the secret scan skips an added line starting `++ `), [BT56](waves/BT56.md) (a stranger's pull request can claim the owner's commit), [BT53](waves/BT53.md) (version and a true first page), [BT55](waves/BT55.md), [PF34](waves/PF34.md), [BT57](waves/BT57.md), [PF35](waves/PF35.md). The owner answered (D-2026-11-10-k48-answers): publish to npm after BT54, BT56 and BT53; launch is positioning, with no stop signal; the kitchen posts no bounties of its own. Still open: squash merges. See [K48](waves/K48.md).

- **Live on the board** (each deployed on the owner's word, `exceededCpu` 0 before and after; details in each wave file): PF33 (the posted issue reads plainly), PF32 (list an existing issue), PF31c, PF31b, PF31 (payment window), PF9b (the sandbox never listed), PF29 (pricing from the board alone), PF28, PF27's For agents page, PF22, PF21, PF20, PF19, PF18 (Stripe), PF16, PF17, PF15, PF14, PF13, PF11, PF8, PF10: https://open-bounty-board.box-platform.workers.dev, at $0, with real sign-in.
- **The solver side is built and proven** (CLI only; reaches users with the next npm release, the owner's to publish): `discover`, `take`, `submit`, `status`, `describe --solving` (PF24 to PF27). PF9a ran every agent flow for real with twelve fresh agents: zero blocks or misleads.
- **The live board is empty** of test records (owner, 4 November 2026); the owner's own sign-ins, Stripe connection and pay settings stay.
- **The live board's bounty detail is slow** (0.4 to 9 s against the tool's 2.5 s limit); briefed as PF34.
- **Stripe is live** since 3 November 2026 (PF18). **No real payment has been made:** the first one is the proof this has not had; read it from the logs. To turn it off: `wrangler secret delete STRIPE_SECRET_KEY`. Optional: ask Stripe whether a restricted key can get Write on Accounts v2.
- **PayPal's review** of the live app, omakase-box, is awaited (submitted 2 November 2026). No PayPal key until it passes; PayPal live is unproven.
- **For PF9:** the CPU of `settlePayPal`, the payments-due notice and `exceededCpu` on the free plan; PayPal's connect on a deployed board; a seat with its own `BOX_BOUNTY_SETTINGS_DIR` gets no default board. Wrangler's login is on this machine; `wrangler logout` ends that.
- **Branches (owner, 31 October 2026):** work closes onto master. `claude/serene-noether-m9qvs3` is left as it is.
- **For the owner, cleanup:**
  - PF18's test objects in "shoutecknik sandbox" (45 test accounts, customers, one webhook): take the access policy off that sandbox's key for a cleanup run, or delete the sandbox; then `%TEMP%\kitchen-PF18-bench` goes.
  - The user variables `STRIPE_TEST_SANDBOX_KEY`, `STRIPE_TEST_RESTRICTED_KEY`, `STRIPE_TEST_KEY` and the `kitchen-pf18` restricted keys in both sandboxes; roll the sandbox secret keys. PayPal's sandbox secret from the PF13 chat: regenerate it and remove the six `PAYPAL_SANDBOX_*` variables.
  - The private `shouteck/kitchen-PF8-private`; the stray `node.exe` from BT44 (PID 16324) and a `bench.mjs` from `%TEMP%\kitchen-PF13-paypal` (PID 472568), if still running.
  - The participant sessions of BT42, BT52, PF2, PF7, PF8, PF15, PF16 and their `%TEMP%` folders (`kitchen-BT52-proof`, `kitchen-PF2-*`, `kitchen-PF7-*`, `kitchen-PF8-reader`, `kitchen-PF15`, `kitchen-PF16*`); six empty `%TEMP%\kitchen-K43-*` folders.

## Next

- **Order (owner, 10 November 2026; each wave still on the owner's go):** K50 resumed next (it makes the rest faster), then BT54, BT56, BT58 and BT60, then BT63, BT53 and the owner's npm publish; BT55, BT57, PF34 to PF38 and K51 any time (BT57 best before the publish); BT59 and BT61 after the publish; K52 before PF6; PF39, K54 and BT62 any time. Design order: PF40, PF41 (before PF39), PF42 (before PF35), PF43 (before K41). Then **PF6** (the listings for both sides), **K41** (the film, last), then the owner's launch. PF23 is deferred.
- **The next tool release:** the guide gains the PowerShell line (`npx.cmd`, `box.cmd`); a new version goes to npm by the owner, and to GitHub by a `v*` tag.
- Unbriefed (BACKLOG): `rmSync` and non-ASCII names on Windows (BT48); solvers' account age (PF4); a private organisation member counts as an outside solver, a squash-merged head reads as off the default branch (PF8); PF18's leftovers; fewer words, more showing, across the site.
- **Direction:** agents run the common case; installing is the only required human step. The platform may start a charge but never holds money; no reminders. Site looks need before-and-after screenshots and the owner's approval.
- **Verify on a cloud host:** k16 needs the pinned browser (BACKLOG). **On the Windows host:** run verify from Git Bash with heavy apps closed.
