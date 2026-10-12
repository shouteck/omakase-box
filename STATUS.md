# Status

Updated by the CTO on 12 October 2026, at the close of wave BT7b.

## Now

- **BT7b is done — merged and pushed** (`bd31c77`; PASS test-verified on `4524abc`, one fix round). A clashing `apply` names the clash facts and `look`, and offers no merge command; every record read scans open bounties for a landed solution commit (`merge-base` ancestry — a nested-merge wrong-attribution bug the pass found was fixed by binary-searching the first-parent chain) and closes the bounty exactly as `apply` does. Git ≥ 2.40 / gh ≥ 2.0 probes refuse by name before anything writes. Two fresh journey agents finished end-to-end — both avoided the clash by reading `look` diffs, itself a UX finding now on the station card.
- **BT6b-ci merged** (`2465d2c`): master is green off-machine again — the `~/`-include test builds its fixture under `homedir()`. **BT6b merged** (`af7b4e6`, ui-verified on `ea0a508`, three corrections): the unsafe-owner-command preflight holds under ~130 live attack configurations; WIP commits ship filtered bytes.
- **K14 merged** (`0448c4f`, owner-accepted partial), K12 (`9fb21f4`), BT7a (`6043833`). `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs remain in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.
- **Briefed but uncooked:** BT7c (removes commands — presented the list in the pre-cook card, **awaits the owner's "go"**), BT8 (owner decisions of 12 October folded in at dispatch), K13 (the bounty tool on Bun — stop-or-go first step) and a possible K-wave for the fixture-world Git floor.

## Next

**BT7c** — fewer commands; named in the last START but gated on the owner's "go" for its removal list (`undo`, `reply`, `remind`; `answer`→`look`/`apply`, `questions`→`status`, `reject`+`withdraw`→one). Then BT8.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`); terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; silent answer collection; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test; the K14 budget guard can't see its own spy die (`≤`-only assertions — a positive-count anchor would close it); `child_process.fork` is an uninstrumented spawn seam. From BT6b: solver-planted operand words invisible at preflight (`find -exec pwn` + planted `pwn`; `rundll32 x.dll,f` comma syntax); conservative over-refusals recorded. From BT7b: version probes cost +1 spawn per command (`git version`/`gh version` — the implementable reading of "no added process start"); `git-too-old` reports major.minor only; a scan-close under a non-status command shows the saved-job context only in that command's output; `apply` on a clash exits 0 (established outcome semantics).
