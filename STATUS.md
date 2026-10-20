# Status

Updated by the CTO on 20 October 2026 at the BT39 close.

## Now

- **BT39 merged** (`bac8c85`); independent PASS on `23e7cbe9638fdf85cfa9580eb58c9f4a9607791d`, verdict `de40d03`, evidence `2a8dffb`. Git reads have explicit 512 MiB bounds and named errors. Guarded native resolution preserves live-byte capture and baseline spelling; unchanged PR listings reuse saved facts with remote-base-tip invalidation.
- **100k create succeeds** on accepted code: 194,476 ms, one run. Status five-run mixed median 11,474 to 863 ms (796-12,110 ms; first regenerates, four cached). Final 10k create median 18,276 to 17,823 ms has overlapping spread; final 1k worker median rose 2,313 to 2,751 ms. No blanket create-speedup or unlimited-size claim.
- **Acceptance:** `verify 23e7cbe PASS check=0 build=0 test:box-bounty=0 test:kitchen=0 db=none 1289s`; 750 bounty/136 kitchen tests passed. Pass's same-SHA invocation lawfully reused that record; independent buffer, never-ship, scan, case-text and final 100k probes passed. BT17 measurement JSON is byte-identical to baseline (exit/line/character counts, not raw output).
- **Corrections retained:** unsafe index-copy capture and pure-native case spelling were rejected, with regressions. Prior reviewer PASS was withdrawn before merge. A timeout under high load passed on scoped rerun; load is context, not proven cause.
- **Planning targets:** local medians create 3 s at 1k / 20 s at 10k; status 2 s unchanged / 15 s changed at 100 PRs; successful 100k capture. PLAN/CONTRACTS state these as planning budgets, not service guarantees; the historic 1 s/10k miss remains recorded. Final tables and limits: `kitchen/reviews/BT39-performance.md`.
- **Verify cost:** `verify: 6 runs, total 5298s`; 5 PASS/1 FAIL, no missing summaries/durations, 5,266 executed step-seconds. Local `.kitchen/runs`, exact IDs and merge bounds in the wave Result.
- Master clean and pushed at close; exact owned scratch and merged branch removed. Latest pre-merge hosted run green `39302652050`; post-push checks not awaited. No live bounty posts, payments or new remote destinations.

## Next

Owner named `START.md: BT40` on 20 October 2026. Run BT40 only: add truthful site-specific `next:` text to refusals, a parser-based guard and the scoped test strengthening; keep reason names, exits, conditions, side effects and stored text unchanged. Independent exact-commit acceptance before merge; no live external actions, payments or file deletions. Stop after BT40. Remaining performance limits are in BACKLOG; BT33 stays parked and BT12 Part B deferred.
