# Status

Replaced by the CTO on 10 October 2026, at the close of wave K10.

## Now

- **K10 is done and merged** (`c0dfdae`, PASS test-verified): every code push to master is now checked off-machine on the suites that cover the bounty tool — `test:box-trace`, `test:box-bounty`, `test:box-package` — on a pinned `ubuntu-24.04` with all four actions on released v7 majors. The 19 October `ubuntu-latest` migration and the Node deprecation notices can no longer change a result between pushes. Proved twice: a green run with the suites visibly executed, and a deliberate `test:box-bounty` break that went red.
- **Twelve Windows-bound tests are marked host-only** by platform or capability probe (junctions, `.cmd` launch, `npm.cmd`, case-insensitive filesystem) — assertions untouched, still running on this host. `test:security` and `test:containers` stay excluded, named with reasons in the workflow. `actions/setup-python@v7` provides the `python` command the suites need.
- **For a later owner decision:** the run is 6m13s, under its ten-minute limit. The 14 earlier-platform suites cost ~3.1 min of it plus ~1 min of Chromium install. Whether to keep running them off-machine is the owner's call, not made in K10.
- **Milestone BT is approved** (BT1 to BT6); BT1 is merged. Each wave cooks only when the owner names it, and the kitchen stops after each. BT6, the first bounty posted outside, needs a separate approval and a choice of site.
- **Known limits for later:** the `secrets` rule over-removes `*secrets*` basenames; a junction-spelled `--out` can land inside the checkout; an untracked file reachable only through a junction still emits live bytes; git-lfs repos ship pointer stubs. All documented in BOUNTY.md and the BT1 wave file.
- **C1's `box trace` is kept but not used by milestone BT.** The smaller Box is a later decision.
- **The lab is paused entirely.** Do not read its brief, answer it or run a sync.
- **Left as they are, not merged and not deleted:** local branches `wave/A6` and `wave/K7`. Deleting an unmerged branch is the owner's call.
- Master is clean and published. Nothing is running.

## Off-machine checks (looked at by the CTO on 10 October 2026)

- **Now meaningful.** The K10 merge push is the first master run with the bounty suites in the list. Before it: green on `wave/K10` (run 38016413100, suites visibly executed) and red on the deliberate-break scratch (38016777127, since deleted). No red on master.

## Next

**BT2: remember.** The bounty's record lives in the project and moves through named stages: `status`, `withdraw`, the owner's recorded yes, and "posting" to a local folder. No brief yet — the CTO writes it when this wave is named. Send `START.md: BT2`.
