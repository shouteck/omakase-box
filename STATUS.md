# Status

Replaced at fix-paired-check close, 7 October 2026 local time.

## Now

- **fix-paired-check is done and merged** (`f47414f`): export's paired check normalises timing-variable output (`Nms`, `N.Ns`, `Start at`, `Duration`) before hashing, so a runner that prints run times no longer forces a refusal; the refusal it does emit says what was observed — same exit, differing output, both tails — instead of blaming a missing file. Detail in `waves/fix-paired-check.md`.
- **What worked:** the fix itself took one cook commit; the pass's `--fresh` run of `test:box-package` caught a wording regression (`/differently/` contract) that the cook's `verify --full` PASS had never exercised — `check`'s diff-reach map covers no `packages/box-package/` path. One-word fix, PASS on `acc9322` with two executed full runs.
- **Limit carried:** `\d+ms` masks any integer-ms token, including substantive data; coverage is narrow in the safe direction (equivalent runs can still refuse). Recorded in BACKLOG.md.
- `K7` is still parked on local `wave/K7`.

## Lab

One wave closed since the lab replaced its brief; no sync owed. Answer in BACKLOG.md "For the lab".

## Next

Nothing is running. The roadmap was brought up to date on 7 October 2026: see "Where we are and what comes next" in PLAN.md. Order: **A6** (the tool starts cleanly off our machine; small), then **R3c** (the stricter replay: two projects, an isolated solver started outside every checkout, report and start time recorded, some cases with the test hidden, one well-formed wrong answer per case), then **P1**, then **R4** with the owner's approval. Recommended next: `START.md: A6`. Awaiting the owner's instruction.
