# Status

Updated by the CTO on 12 October 2026, at the close of wave K14.

## Now

- **K14 is done — merged and pushed** (`0448c4f`, PASS test-verified on `014a93c`, one fix round). Git starts per bounty command down to a pinned budget (177 git / 31 gh across the 27-command journey); suite starts 11,421 → 8,866 (−23%); output byte-identical; a counting guard (`k14-start-budget.test.ts`) pins per-command budgets — proven non-vacuous by an independent spy. **Owner accepted the partial:** the ≤⅓ target is unmet — the remaining floor is real fixture construction that is itself the Git coverage; a virtualized-Git restructure is a possible later wave.
- **K12 merged earlier today** (`9fb21f4`): 3-worker bounty suite (~350s), DB-on-demand, diff-scoped check. **BT7a merged** (`6043833`): print-only `look`, questions/`reply`, new-and-seen, resume context, id-less commands.
- **Live defect on master, for the owner to see:** if the owner's Git configuration names a filter program that lives inside the repository, a solution that replaces it gets it run at a clean `apply` and `undo`. Also: `post --with-changes` pushes unfiltered bytes. **BT6b is the correction wave** — next by plan order.
- BT1–BT7a, K-waves and ci waves are merged. `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs from killed test runs sit in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.
- **Briefed but uncooked:** K13 (the bounty tool on Bun — stop-or-go first step) and a possible K-wave for the fixture-world Git floor.

## Next

**BT6b** — the filter-program defect. Send `START.md: BT6b`.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`); terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; silent answer collection; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test; the K14 budget guard can't see its own spy die (`≤`-only assertions — a positive-count anchor would close it); `child_process.fork` is an uninstrumented spawn seam.
