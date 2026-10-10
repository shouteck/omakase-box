# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT1.

## Now

- **BT1 is done and merged** (`1d1c32b`, PASS ui-verified after one fix round): `box bounty create` turns "hand this off" into a complete bounty folder on disk — a snapshot of the repository as it stands (reproducible from an unreachable snapshot commit), never-ship files removed on real paths, task, note, a check proven to fail today, its level, and a stranger-readable listing. Preview shows exactly what would leave; nothing is posted. New suite `test:box-bounty`; docs in `docs/box-v4/BOUNTY.md`.
- **Milestone BT is approved** (BT1 to BT6). Each wave cooks only when the owner names it, and the kitchen stops after each. BT6, the first bounty posted outside, needs a separate approval and a choice of site.
- **Known limits for later:** the `secrets` rule over-removes `*secrets*` basenames; a junction-spelled `--out` can land inside the checkout; an untracked file reachable only through a junction still emits live bytes; git-lfs repos ship pointer stubs. All documented in BOUNTY.md and the wave file.
- **C1's `box trace` is kept but not used by milestone BT.** The smaller Box is a later decision.
- **The lab is paused entirely.** Do not read its brief, answer it or run a sync.
- **Left as they are, not merged and not deleted:** local branches `wave/A6` and `wave/K7`. Deleting an unmerged branch is the owner's call.
- Master is clean and published. Nothing is running.

## Off-machine checks (looked at by the CTO on 10 October 2026)

- **Not failing.** The run is green on the latest code push (`1d1c32b`, BT1) and on C1 before it. The red marks in the run history are old: two on master from 6 October, fixed the same day by K7-ci and K7-ci2, and four from K8's own branches, one of them a deliberate break. Pushes that change only documents start no run, so the newest commit shows no mark at all.
- **But the run does not test the bounty tool.** `test:box-trace`, `test:box-bounty` and `test:box-package` are not in its list; it spends its time on the earlier platform. Until that is fixed, a green mark says nothing about milestone BT, and acceptance rests on the host's verify alone, as the rules already require.
- **Two things will move under it:** the runner label changes to a new Ubuntu from 19 October 2026, and the actions it uses are on a deprecated Node version.
- **What to do:** wave **K10** (`waves/K10.md`) fixes all three. It is a kitchen wave, so it runs only when named. The owner puts the product first: cook K10 when the owner names it, and in any case before BT5, the first real bounty. If a run on master goes red before then, the usual rule holds: the next wave is the fix.

## Next

**BT2: remember.** The bounty's record lives in the project and moves through named stages: `status`, `withdraw`, the owner's recorded yes, and "posting" to a local folder. No brief yet — the CTO writes it when this wave is named. Send `START.md: BT2`. To fix the off-machine run as well, `START.md: K10` (small; either order).
