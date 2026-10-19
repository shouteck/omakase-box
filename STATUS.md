# Status

Updated by the CTO on 19 October 2026 at the K39 close.

## Now

- **K39 merged** (`d1967a8`; independent PASS test-verified on `1aee0f5`, verdict `3d9384f`). Delivers `kitchen/memory/scale/measure.mjs` (`--target=<1|2|3|4|all>`) and `kitchen/reviews/K39-scale.md`, measuring all four previously unmeasured scale targets with 5 runs each, median/min–max spread and sampled CPU-busy disclosure.
- **Scale verdicts (3 met, 1 missed):**
  - **T1 (`create` <1 s at 10,000 files) — MISSED ~20×:** 20,617 ms median (17.9–22.2 s) at 10k files; 2,318 ms at 1k; at 100k files **5/5 runs fail** with `ENOBUFS` because `snapshot.ts:70` (`git ls-tree -r -z`) calls `git.ts:204` with Node's 1 MiB default `spawnSync` `maxBuffer` (while `cat-file` paths set 512 MiB). Recorded in `kitchen/INBOX.md` for a product fix wave.
  - **T2 (whole `post` <30 s) — MET:** 2,193 / 2,356 / 2,337 ms medians at 0 / 5 / 50 unpushed commits with `--with-changes` (pass live rerun: 2,410 / 2,444 / 2,186 ms); local plan+scan (~1.2 s) dominates over push (~0.13 s).
  - **T3 (100 solutions on one bounty) — MET:** `status` 9,107 ms first-discovery / 8,754 ms steady-state median; `--full` 8,880 ms; `--json` 9,530 ms; `look 1` 372 ms, `look 100` 340 ms; `status` output bounded at 108 lines / 4,802 chars.
  - **T4 (`apply` and `close` at 1,000 records) — MET:** `apply` 2,738 ms (vs 1,950 ms at 10 records), `close` 2,133 ms (vs 1,353 ms at 10 records) — ~1.4–1.6× growth.
- **Verify cost:** `verify: 2 runs, total 99s` (2 PASS, 0 FAIL, 0 missing/malformed summaries, 82 executed step-seconds) from post-merge `node scripts/kitchen-stats.mjs --wave=K39`.
- Main checkout is master; all `%TEMP%\kitchen-k39-*` and `k39-*.log` items and the merged branch are removed. Latest hosted result before merge was green `39289545709`; post-push checks are not awaited.

## Next

This run was started with `START.md: BT38` on 19 October 2026. Dispatching BT38 only: add direct tests for guarantees T1 (unasked text constant), T4 (reads change nothing shared), C5 (snapshot resolvable or report contract state), and PL3 (representative refusals per stage carry a next step), prove T1/T4/PL3 bite in a scratch copy, and remove the unused `refuse` helper in `packages/box-bounty/look.ts`. Stop after BT38; K39's `create` 10k/100k finding is recorded in `BACKLOG.md`; BT33 stays parked and BT12 Part B deferred.
