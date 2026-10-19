# Status

Updated by the CTO on 19 October 2026 at the BT37 close.

## Now

- **BT37 merged** (`0584bcf`; independent PASS test-verified on `b03121a`, verdict `bd56e04`). Five bounded fixes from K31b: local-merge/publish guidance, consistent waiting-PR facts, clearer cannot-help advice, once-only tracking warnings and compare-before-write OPEN.
- **Apply stays local.** Output follows Git's ahead/upstream convention and offers the publish command; detached/unreadable states do not invent one. The tool never pushes. The issue comment now explains that the owner must push. No stage transition or GitHub call changed.
- **Waiting facts stay current.** Available PRs, including an empty list, override seen history; one re-pushed PR counts once, not twice. Latest waiting activity also feeds JSON. Collected old heads do not hide new heads; malformed times remain unavailable.
- **Acceptance:** worker `verify b03121a PASS check=0 build=0 test:box-bounty=0 test:kitchen=0 db=none 1028s`; pass's exact-SHA invocation reused that valid record and reran all 15 focused cases. Final suites: 736 bounty tests passed, 1 skipped; 136 kitchen tests passed. An earlier three-test verify failure and a withdrawn reviewer PASS remain recorded; the PR-revision counterexample now has a failing-before/passing-after regression.
- **Budgets:** apply measured 26 Git/5 gh, inside unchanged K14 limits; only describe's character budget rose, exactly 85 to 2,085 for the measured dynamic journey. Its static output is smaller.
- **Verify cost:** `verify: 5 runs, total 2672s`; 4 PASS/1 FAIL completed summaries, 0 missing summaries/durations; 2,656 executed step-seconds. Post-merge `node scripts/kitchen-stats.mjs --wave=BT37`, local ignored `.kitchen/runs` with exact source IDs and merge-parent bounds in the wave Result. Wall duration is not CPU/agent effort.
- Main checkout is master; owned scratch and merged branch removed, no matching covered temp items or node/Postgres test process at close. Pre-existing stash/K14 artifacts untouched. Latest hosted result before merge was green `39254999319`; BT37 post-push jobs are not awaited. No real GitHub journey or payment performed.

## Next

This run was started with `START.md: K30` on 19 October 2026. Dispatching K30 only: write stage contracts (`docs/box-v4/CONTRACTS.md`), map every guarantee and scale target to its proof (`kitchen/reviews/K30-contracts.md`), prove at least five critical guarantees bite in a scratch copy, rank gaps, and propose hardening waves. No product or test edits, no deletions, no external posts. Stop after K30; BT33 stays parked and BT12 Part B deferred.
