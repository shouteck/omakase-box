# Status

Updated by the CTO on 19 October 2026 at the BT36 close.

## Now

- **BT36 merged and pushed** (`7c4874f`; PASS test-verified on `dce463f`, verdict commit `0ff9ab6`). `box bounty config set paid <id>` records the owner's word that a merged bounty's solver was paid; `no` withdraws and keeps the history. `status`, `status --json`, the overview (`<k> payment(s) owed`) and the shared memory show owed/paid. The amount comes only from the bound reward; nothing is verified, moved or posted to GitHub.
- **One FAIL loop, resolved:** the first candidate left a stale bt11b assertion expecting the old `pay $5` line; the fix commit updated the three expectations to the `payment: owed` wording and the pass confirmed they fail under the reverted implementation. `verify dce463f PASS check=0 build=0 test:box-bounty=0 test:kitchen=0 db=none 1052s`.
- **Brief artefact corrected:** `test:box-package` does not exist; acceptance ran `test:box-bounty` + `test:kitchen`. Pass limits recorded in waves/BT36.md (F3 shared-only refusal code-read only).
- The cook's first full verify died mid-run with its session (no summary.json); the pass's own run was the first complete one. Two inbox lines carry the lessons (verify-vs-timebox checkpoint; real suite names in briefs). Station card gained the old-wording sweep.
- Main checkout is master, clean. Merged `wave/BT36` deleted. No `box-d21-*`/`box-k6-*`/`kitchen-verify-pg*` or `bt36-*` temp items remained at close. Latest hosted run before merge was green `39149271317`; the post-push run is not awaited.

## Next

This run stops after BT36. No wave is in flight or starts automatically. K30's K29/BT32 dependencies are satisfied; K31 still needs the owner's "go" for real $0 public posts; K33 is ready any time. BT33 stays parked and BT12 Part B stays deferred.
