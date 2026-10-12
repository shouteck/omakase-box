# Status

Updated by the CTO on 12 October 2026, at the close of wave BT7a.

## Now

- **BT7a is done — merged and pushed** (`6043833`, PASS test-verified on `85e6612`). `look <id> <n>` prints the solver's change against the commit the bounty named — creates nothing, runs nothing, escapes hostile bytes; a large solution lists files first and `--full` prints the diff. With it: solvers' questions and `reply`, new-and-seen marking, the saved job context, commands that work without an identifier, and the shorter `status`. A clashing `apply` keeps master's refusal and names `look`. The owner's same-day scope change (print, don't copy) cut ~800 lines of copy machinery before review.
- **BT7 stays parked** at `e1920ca` for the record; its clash path is superseded — BT7b is rebriefed as "the tool owns the bounty's life" (clash facts, recognise any merge, close; no side copy, no finish/cancel). BT7c is a briefed removal wave (fewer commands, waits for the owner's go).
- **Live defect on master, for the owner to see:** if the owner's Git configuration names a filter program that lives inside the repository, a solution that replaces that program gets it run on the owner's machine at a clean `apply` and `undo`. Also: `post --to github --with-changes` pushes unfiltered bytes of a clean-filtered file. **BT6b is the correction wave for both** — briefed, next after BT7a by plan order.
- BT1–BT7a and the ci waves are merged. `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; the tool is installed with reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- The bounty suite is slow and thin on margin under host load (705 s / 215 tests); K12 is briefed to attack verify time. About 73 `box-bt1-*` folders from killed test runs may sit in temp; they are not on the standing deletion list.

## Next

**BT6b** — the filter-program defect, by plan order (it comes before BT7b). Send `START.md: BT6b`.

Carried findings for later waves: confirm/post bookkeeping drifts the approved work-in-progress set (`github-preview-stale`); terminal `undone` prevents reapply and does not reopen the issue; leftover work-in-progress bytes can block collection apply; unpinned lineCounts git diff; silent answer collection (~2.5 min); refusal/exception paths still unquoted; closing a PR by deleting its base can look like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p` (BT7b should remove it); a `look` on an ended bounty after GC fails as a plain git error, not a named refusal.
