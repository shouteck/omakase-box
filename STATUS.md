# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT3a.

## Now

- **BT3a is done and merged** (`5a6456c`, PASS ui-verified, all three lenses): `answer` now writes a report of facts — check result before and after, the optional `--guard`, the change with file and line counts, a `merge-tree` dry read naming conflict paths, eager flags, and always a "not checked" line plus the next command. A pass waits at `verified`; a failure is a recorded attempt and the bounty returns to `posted`. Several answers per bounty, `apply <id> [<n>]`, and `undo` reverses an applied merge as a new commit with named refusals. A test polices verdict words out of the report.
- **BT1–BT3 + BT3a are merged.** The journey works end to end: create → record → confirm → post → answer (facts) → apply/reject/undo.
- **Known limits for later:** solver-controlled check output can carry a banned word inside the quoted tail (the words rule covers the tool's own lines); post-abort `git status` stat-flag cosmetic under autocrlf; `status` on `answered`+conflicts doesn't echo paths; plus the standing set — `--to` junction residual, forgeable-record convention, `secrets` basename over-removal, untracked-via-junction bytes, git-lfs stubs, wrong-verb status message.
- **The off-machine run tests the product** and is green on master (BT3 merge run 6m26s with the bounty suites). Whether to keep the 14 earlier-platform suites off-machine is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6). Each wave cooks only when the owner names it. BT6 needs a separate approval and a site.
- **C1's `box trace` is kept but not used by milestone BT.** The lab is paused entirely.
- **Left as they are:** unmerged local branches `wave/A6` and `wave/K7` (owner's call).
- Master is clean and published. Nothing is running.

## Roadmap (owner decisions of 10 October 2026, in PLAN.md)

- The tool does everything mechanical and reports facts about an answer, never a verdict; using it is always at the agent's discretion; every bounty records one line of why.
- BT4 is accepted by constructed scenarios (PLAN.md, "How BT4 is accepted"); BT5 has three parts: the journey, judgement, and open observation.

## Off-machine checks (looked at 10 October 2026)

- Green on master: BT2 and BT3 merge runs both passed with the product suites (~6m25s). Latest before the BT3a merge — check `gh run list` before the next one.

## Next

**BT3b: fewer things to supply.** The one line of why, defaults, evidence gathered by the tool, `help`, and the known rough edges above. No brief yet — the CTO writes it when named. Send `START.md: BT3b`.
