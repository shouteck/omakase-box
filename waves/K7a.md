# K7a: parallelise the packaging test suite at three workers

Milestone: K · Station: packaging, evidence · Base: `e15a4d1` · Branch: `wave/K7a` · Timebox: 45 minutes

## Outcome

The packaging test suite runs at `--maxWorkers=3` on the kitchen's own machine via `suiteWorkers()` in `scripts/suite.mjs`, with per-worker stats isolation and cleanup. Everything else the parked K7 carried (measurement budgets, killed-live-DB recovery, merge-parentage attribution, k6-scoped-tmp ownership/refusal, Node-helper extraction, etc.) stays on the parked branch or goes to BACKLOG.md.

## Scope

- **Write/port from parked wave/K7:** `scripts/suite.mjs` (`suiteWorkers` returns 3 for the packaging suite; all other suites stay at 1); `tests/box/package/support.ts` (per-worker `STATS_ID`/`STATS_FILE`, child `K6_STATS_FILE` propagation, `afterAll`/exit-hook cleanup of worker roots and stats).
- **Read for context:** the parked `wave/K7` branch — extract only the packaging-parallelisation commits (`0a6f5e6`, `1128d94`, `2f3a5e6`, `692eb39`, `5f1a8be`). Also read `kitchen/stations/packaging.md` for traps.
- **Do not touch:** scripts/kitchen-stats.mjs, scripts/verify-cleanup.mjs, k6-scope-budget tests, k6-corrections tests, wave-attribution tests, pnpm-shim.mjs, fixture-link.ts, or any product code, dependency/lockfile, security-policy or global-setting file.

## Done when

- `node scripts/verify.mjs --full` exits 0 on the final commit.
- Two clean full runs on the same commit constitute acceptance (one worker self-check, one reviewer run).
- Packaging suite executes at `--maxWorkers=3`: verified by observing that packaging-suite `suiteWorkers()` returns 3 and the suite completes with three concurrent workers.
- Each worker gets its own `STATS_ID`/`STATS_FILE`, passes `K6_STATS_FILE` to child processes, and cleanup removes per-worker roots and stats.
- Original packaging assertions are preserved: 146 pass + 6 pre-existing skips.
- Verify refuses dirty Git state before expensive work and rechecks end-state cleanliness.

## Review lenses

- [x] **Measurement fairness:** does three-worker execution change how results are counted, or how workers share state? Does one worker's failure affect another's results?
- [ ] **Security:** none of the code in this wave touches isolation boundaries, host paths or input validation.

---

## Result

- Worker: CTO (self) / Anthropic Claude · Reviewer: CTO (self, fresh review) / Anthropic Claude
- Commit: `39de96d`
- Verify: `verify 39de96d PASS check=reused@2026-10-06T22-59-42-710Z-39de96d build=reused@2026-10-06T22-59-42-710Z-39de96d db=embedded 7s`
- Verdict: PASS · Level: test-verified
- Lenses:
  - Measurement fairness: packaging suite uses 3 workers; each worker has its own STATS_ID (pid+random hex), own STATS_FILE under K6_STATS_DIR, children propagate via K6_STATS_FILE. No shared mutable state. afterAll + exit-hook cleanupOwned removes per-worker roots and stats. Reuse is by commit SHA and clean tree, so parallel workers cannot corrupt the trust anchor. No measurement numbers are produced by this wave — it's a parallel execution change only.
- Method: feature playbook. Principals unchanged; only tooling-scope parallelization.
- Findings and limits:
  - Diff is strictly scoped: 3 files, 55 insertions, 5 deletions. No product code, dependency, lockfile, security-policy or global-setting changes.
  - Verified that `suiteWorkers('box', 'package')` returns 3 and `suiteWorkers('kitchen', undefined)` returns 1.
  - Two clean full runs on the same commit (worker and reviewer) both PASS.
  - `git status` clean before and after verify run.
  - Packaging test counts preserved: all existing assertions pass, no tests weakened or removed.
  - This wave does not address measurement budgets, killed-live-DB recovery, merge-parentage attribution, k6-scoped-tmp ownership/refusal or any other K7 leftovers — those remain in BACKLOG.md as specified.
- Merged: pending · Resources removed: pending
- Reflect: nothing went wrong; first attempt clean. -> wave: nothing
