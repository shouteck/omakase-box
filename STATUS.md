# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT3b.

## Now

- **BT3b is done and merged** (`ec5f1d2`, PASS ui-verified on `ee8ff94`, fifth candidate — four fix rounds, all inside the auto-composed note's honesty): `create` now requires `--why "<line>"` (recorded record-only, never shipped), derives the title from the task, defaults `--out` to `bounties/<title-slug>` next to the repo root, and composes the note itself from gathered evidence (check exit + output tail, files changed vs `baseCommit`, deleted files named, never-ship names suppressed). `box bounty help` prints the one-screen journey and works outside a checkout; bare `box bounty` points at it. Every success line ends with the exact next command. `--out`/`--to` are junction-canonicalized (the BT2 residual is dead — a nonexistent tail under a junction can no longer land in-repo); refusals name the command actually run.
- **A pre-existing undo clobber was pulled into the wave and fixed:** `undo`'s touched set folded renames, so `git revert` silently overwrote an ignored file at a rename source — now refused `undo-worktree-dirty` with a regression test.
- **BT1–BT3b are merged.** The journey is complete and cheap: create (why + task, rest defaults) → record → confirm → post → answer (facts) → apply/reject/undo; `help` explains it to a cold agent.
- **Known limits for later:** junction indistinguishability family — a link planted post-base pointing at a never-base-tracked canonical can still print the "differs only in files that do not ship" line, and a base-time double-junction can name an unchanged file as changed (git records no link state; documented in `waves/BT3b.md`, errs toward reporting); a junction at a deleted gitlink's spelling is invisible to git; solver-controlled check output can carry a banned word inside the quoted tail; post-abort `git status` stat-flag cosmetic under autocrlf; `deltaPaths` still folds (backstopped by `extraTouched`, judged not-a-defect); plus the standing set — forgeable-record convention, `secrets` basename over-removal, untracked-via-junction bytes, git-lfs stubs.
- **The off-machine run tests the product** and is green on master. Whether to keep the 14 earlier-platform suites off-machine is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6). Each wave cooks only when the owner names it. BT6 needs a separate approval and a site.
- **C1's `box trace` is kept but not used by milestone BT.** The lab is paused entirely.
- **Left as they are:** unmerged local branches `wave/A6` and `wave/K7` (owner's call).
- Master is clean and published. Nothing is running.

## Roadmap (owner decisions of 10 October 2026, in PLAN.md)

- The tool does everything mechanical and reports facts about an answer, never a verdict; using it is always at the agent's discretion; every bounty records one line of why.
- BT4 is accepted by constructed scenarios (PLAN.md, "How BT4 is accepted"); BT5 has three parts: the journey, judgement, and open observation.

## Off-machine checks (looked at 10 October 2026)

- Green on master: BT2, BT3 and BT3a merge runs all passed with the product suites (~6m30s). Latest before the BT3b merge — check `gh run list` after it lands.

## Next

**BT4: tell the agent.** Three switchable pieces — the tool's description (what, when, when not), the lines for a project's rules with an "open bounties" line the tool keeps current, and reminders at moments of difficulty (off by default) — plus the owner's limits file. Accepted by the constructed scenarios in PLAN.md, with two or three wordings tried. No brief yet — the CTO writes it when named. Send `START.md: BT4`.
