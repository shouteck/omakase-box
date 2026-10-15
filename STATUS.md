# Status

Updated by the CTO on 15 October 2026 at the K23 close.

## Now

- **K23 completed.** The heavy bounty tests are cheaper, not longer-limited: the verdict-word case shares one posted world and is back under the default limit (its 120 s override removed), the enormous-history test uses one fast-import plus batched blob reads (70.4 s → ~7 s), and the bt11 promise-lock test sits inside 15 s again. Verify also reuses an ancestor's clean-tree PASS when every path changed since is one the step does not read — a wave-file-only commit now reruns only `test:kitchen`, which is the exact stall that ate K22. Reviewed `c74e042`, independent PASS test-verified; merged `da8854e`. The pass's own after-measurement: 399 s suite wall, 496/496 green, against a 551 s baseline (external load explained the slower standalone runs).
- **K22 completed.** Master's checks now catch what they should: a bounty-tool change always runs the kitchen suite, the files kitchen tests read are never skipped by the hosted check, and a parity test holds the three GitHub stand-ins to the same answers. Reviewed `debc581`; merged `f7a76f9`.
- **K21 completed.** `kitchen/reviews/K21-architecture.md` maps the eight components and lands verdicts on thirteen suspects (9 confirmed, 4 partly, 0 refuted); merged `563428f`. Earlier waves: BT16 (`d04a072`), K20 (`c31c856`), BT17 (`c5fdd79`).
- No real bounty, payment, owner-settings change or solver-code execution anywhere in the run; all scratch removed.

## Next

Nothing is in flight. The owner agreed on 15 October 2026 to the CTO's recommendations after reviewing the run: the queue below, and two decisions (closing up on GitHub runs whatever the standing answer and says so; `--json` on `status`, `look` and `config`), now in PLAN.md. All remaining briefs are written in detail for a cook without deep reasoning.

Queue, in dependency order: **BT18**, **BT19**, **BT20**, **BT21**, **BT22**, **BT23**, **BT24**, **BT25**. Each cooks only when named. BT12 (the npm package) stays proposed and waits for the owner.
