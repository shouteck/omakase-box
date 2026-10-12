# Status

Updated by the CTO on 12 October 2026, at the close of wave K12.

## Now

- **K12 is done — merged and pushed** (PASS test-verified on `8b37375`). Verify is faster where it was slow: the bounty suite runs three measured workers in parallel (~350 s vs ~700 s), the disposable Postgres starts only for suites that need one (`db=none` otherwise), and `check` runs only what the diff can reach (~18 s on a product-only change). Honest limit: the "third of total" outcome was not demonstrated — check+package dominate the remainder — and the suite still times out under saturated host load. One fix round (the pass caught named DB suites getting `db=none`; now derived-and-pinned).
- **BT7a merged earlier today** (`6043833`): `look` prints the solver's change and creates nothing; questions/`reply`, new-and-seen, saved job context, id-less commands, shorter `status`. BT7 stays parked for the record; BT7b is rebriefed as the lifecycle wave; BT7c is a briefed removal wave awaiting the owner's go.
- **Live defect on master, for the owner to see:** if the owner's Git configuration names a filter program that lives inside the repository, a solution that replaces it gets it run at a clean `apply` and `undo`. Also: `post --with-changes` pushes unfiltered bytes. **BT6b is the correction wave** — next by plan order.
- BT1–BT7a, K-waves and ci waves are merged. `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs from killed test runs sit in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.

## Next

**BT6b** — the filter-program defect. Send `START.md: BT6b`.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`); terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; silent answer collection; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test.
