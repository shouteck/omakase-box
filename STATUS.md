# Status

Updated by the CTO on 19 October 2026 at the K31b close.

## Now

- **K31b merged** (`76b4f50`; independent PASS test-verified on `f852900`, verdict `d072365`). Report: `kitchen/reviews/K31b-real-use.md`; evidence in `kitchen/memory/real-use-b/`.
- **Experiment A (instructed loop):** the whole loop ran on real GitHub three times — post -> solver PR -> look -> apply -> closed. A2 had two solvers (identical diffs; one merged, one closed). A3's designed reject never ran: the poster repaired the task's own contradiction and the good solution was applied - recorded ending per the brief.
- **Experiment B (uninstructed decision):** 1 of 3 handed off. B2 (forbidden `shared/` folder) handed off correctly; B1 declined with a precise reason (a solver cannot reach the Debian host either) and fixed it itself; B3 declined correctly. All three checked existing bounties first - K31's blind spot gone.
- **work-b:** read the shared memory transparently and became the missing solver for the open bounty. Memory questions M2/M5/M9 right, M11 partly.
- **Product findings for the roadmap:** `apply` merges locally and closes GitHub, but remote `main` never moves and nothing prompts a push; `status` briefly contradicted an open PR; `describe`'s worth-it list lacks the "solver can't do it either" case; `.box/bounties/OPEN` phantom-dirty under autocrlf. All in the report's fixes list.
- Capture fixed: baked wrapper env logged 347/347 gh starts, zero transcript-derived.
- Sandbox clean: 0 open issues / 0 PRs; `main` `747f4b5`; only two pre-K31 `fix/*` branches remain. Scratch deleted; wave branch deleted.
- K31b post-push checks not awaited. K31, K33-K37 remain shipped.

## Next

Owner named `START.md: BT37` on 19 October 2026. Dispatch BT37 only: the five bounded product fixes from K31b, with stand-in regression tests and an independent pass. No real GitHub journey, payment or deletion. Inbox lessons are handled: local-apply wording is adopted into BT37; task sizing was exercised by K31b; wrapper environment knowledge already lives in the station card and saved shims. Stop after BT37; K30 remains available, BT33 parked, BT12 Part B deferred.
