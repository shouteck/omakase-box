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

## Next

**BT2: remember.** The bounty's record lives in the project and moves through named stages: `status`, `withdraw`, the owner's recorded yes, and "posting" to a local folder. No brief yet — the CTO writes it when this wave is named. Send `START.md: BT2`.
