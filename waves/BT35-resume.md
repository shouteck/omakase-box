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

- Worker and reviewer:
- Dispatch base and merge:
- Candidate and report commits:
- Verify:
- Verdict and lenses:
- Timestamp policy and behavioral proof:
- Preserved bounds and limits:
- Saved and resources:
- Method and Reflect:
