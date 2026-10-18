# Status

Updated by the CTO on 18 October 2026 at the BT35 parked close.

## Now

- **BT35 parked, not merged.** Candidate `2232cb8` is preserved on local and origin `wave/BT35`, report tip `cc97892`. Independent FAIL on the first candidate and FAIL/blocked on the correction are recorded on that branch.
- **Remaining defect:** finite `Date.parse` accepts non-ISO strings such as `2026/10/01`, which still leak into the JSON fields promised as ISO timestamps. The age boundary needs strict validation or normalization and a regression for this input class.
- **Acceptance missing:** the correction's only full run was `2232cb8+dirty FAIL`, 1,023 seconds. A worker-created `nul` file invalidated the clean-tree requirement; two other tests timed out. Scoped reruns are not acceptance, and the previous candidate's green run cannot accept this code. The original 90-minute timebox does not fit another full run.
- **Saved work:** age display, bounded once-said reminders, shared-only notice handling, documentation and 15 BT35 tests are on the parked branch. The reviewer reproduced the remaining defect with the built CLI. No product change from BT35 reaches master.
- **Master remains K29's bounty-only product.** The archive and living memory specification remain intact. Latest completed hosted master run at close: green `39121839273`, 2m47s. Close-document pushes are not awaited.
- Main checkout is master. Worker/reviewer scratch and polling artefacts are cleaned; no matching test/Postgres process or covered temp item was found. The unmerged BT35 branch is retained deliberately.

## Next

This run stops after parked BT35. Recommendation: resume BT35 in a separately authorized timebox with a fresh cook, fix the timestamp contract, complete a clean full verify, then obtain independent PASS. No work starts automatically. BT33 stays parked; BT12 Part B stays deferred; BT36 has not started.
