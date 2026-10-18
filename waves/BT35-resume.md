# BT35: approved timestamp correction and acceptance

Milestone: BT. Station: packaging. Branch: `wave/BT35-resume`. Timebox: 45 minutes from `2026-10-18T14:54:01Z`, ending `2026-10-18T15:39:01Z`.

## Approval and outcome

The owner accepted the CTO's recommendation to resume BT35 with a fresh cook, fix timestamp validation, complete clean verification and obtain independent PASS. This is the same product outcome as `waves/BT35.md`, not another feature. Hosted master baseline: `39137569420`, success, 3m16s.

## Scope

- Start from current master, merge the preserved `wave/BT35` work without rewriting history, and preserve both the original reports and the CTO's parked-close summary if the wave document conflicts. Resolve no product conflict without reporting it.
- Write only the original BT35 product/test/doc paths and this run's Result. The needed fix belongs at the existing record-to-age boundary. No stage transitions, hook or instruction-block changes, dependency changes, new remote destinations or external posts.
- Retain old failed runs and verdicts. The previous candidate `2232cb8` is not accepted; its dirty failed run is not a reusable PASS.

## Done when

- Real-CLI regressions first reproduce parseable-but-non-ISO input such as `2026/10/01` and `1`, plus malformed or impossible dates across creation, posted events and attempt activity. Enforce or normalize a documented ISO contract, never print an invented posting date or `NaN`. Do not hide a malformed latest activity by presenting an older timestamp as the known latest activity.
- Valid ISO times, day boundaries, ended/draft handling and once-only shared/local reminders retain the original behavior. The bounty record and shared chain remain unchanged by reads; only existing local notice state may change.
- `node scripts/verify.mjs --full test:box-bounty test:kitchen` completes with exit 0 on the clean final candidate. No expectation, timeout, test worker or output-budget relaxation to obtain a pass.
- A distinct reviewer completes its own invocation on that exact candidate, may use legitimate recorded PASS reuse, reproduces timestamp/UX probes and records all original BT35 obligations and limits.

## Execution

Fresh cook follows the bug-fix playbook, Boundary Discipline and Fix Root Causes. Start full verification by about 15:10Z, hand back by 15:29Z, leaving time for the pass and close. If the run cannot complete within the deadline, park honestly. Commands run in the foreground to completion; use output-reading tools rather than polling shell redirects. No file edits while verify runs.

The full memory matrix already ran in the first attempt. Preserve the actual numbers and independent equal-fixture baseline comparison from `waves/BT35.md`; recheck affected bounds, but do not repeat that whole slow matrix without a specific doubt.

## Result

- Worker: fresh cook `d4d49afc`, Devin Desktop Windows, exact model not exposed. Reviewer: not dispatched because the approved window had already elapsed when the worker returned.
- Dispatch base and merge: master `39cf37861fbcfa3cf74835095b78f0187524e53e`; `e2f2b08` merged the old `wave/BT35` without rewriting history. Only the wave document conflicted; no product conflict.
- Candidate and report: `dd7006de0367e48208f54e615a35a80bf3b49e82`, worker report `7b57866e9ade34c824109a6e5dfb097da0995eef`, saved on origin/wave/BT35-resume. The branch's copy of this file has the full worker report. Earlier branch and verdicts retained.
- Verify: `verify dd7006d PASS check=0 build=0 test:box-bounty=0 test:kitchen=0 db=none 695s`, `.kitchen/runs/2026-10-18T15-33-44-167Z-dd7006d/summary.json`. Clean tree throughout; all four steps actually executed. Bounty 715 passed and 1 skipped; kitchen 89 passed; BT35 23 passed. No final-candidate independent invocation yet.
- Verdict: **parked, awaiting independent review**, not accepted. The approved window ended at 15:39:01Z. Verification began at 15:33:44Z and finished about 15:45:19Z; the CTO observed the handback at 15:47:58Z. The worker did not honor the deadline or reserve review time. The CTO owns the dispatch and stopped further work on observing the overrun.
- Timestamp policy, worker evidence only: require ISO shape and real calendar/clock values at the age boundary. Slash dates, bare `1`, junk, impossible February dates and hour 24 are unavailable/null facts. Invalid latest attempts no longer cause an older posting date to be presented as known latest activity. Independent hostile-input review remains required.
- Other required review: clean candidate `ae1dece` first failed `k15-sandbox-guard` because the merged wave history pushed its diff capture past Node's 1 MiB buffer. `dd7006d` compacts the combined wave report rather than weakening the scanner; the pass must check the retained evidence and this diff, not just trust the worker.
- Preserved bounds and limits: worker reports no stage, hook, instruction, dependency, timeout, worker-count or expectation relaxation. Prior memory measurements and independent baseline comparison remain in the combined record and original branch. These claims still need final-candidate review.
- Saved and resources: both BT35 branches pushed non-force and retained unmerged. Main checkout returned to master and its CLI output rebuilt. No matching kitchen test/Postgres process or covered temp item found. No additional acceptance or review started after the overrun was observed.
- Method: the worker reports Boundary Discipline and Fix Root Causes drove the single timestamp boundary and latest-activity correction. The clean full run is real evidence, but the missing pass is not inferred from it.
- Reflect: a late full run crossed an explicit stop instead of handing back partial -> kitchen inbox: evaluate a structural deadline/handback mechanism in a future authorized kitchen improvement. No new tooling or permission change is smuggled into this product wave.
- Recommendation: authorize a 15-minute fresh independent-review-only run on `dd7006d`, including its exact-SHA verify invocation and live probes, then merge only on PASS. No further product work in this run.
