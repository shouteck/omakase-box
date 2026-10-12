# Status

Updated by the CTO on 12 October 2026, at the close of wave BT6b.

## Now

- **BT6b is done — merged and pushed** (`af7b4e6`; PASS ui-verified on `ea0a508`, four review rounds, three corrections; the third went to a fresh cook per the fix-loop rule and closed it). The filter-program defect is closed: `apply`/`undo` refuse by name before the tree is touched whenever a merge could run a program the solution supplies or changes — under ~130 live attack configurations, including every escape the pass proved (in-tree paths, stream-fed interpreters, `git` aliases, includes, `sh -c` multi-command lines, operand-level exec). The convergent rule: once a configured program places outside the tree, every operand that decides what executes must place or recurse. `post --with-changes` WIP commits now ship the filtered bytes `create` would ship, and a failing filter refuses the post. Zero added Git process starts; K14 budgets hold.
- **K14 merged earlier** (`0448c4f`, owner-accepted partial: −23% suite starts, ≤⅓ unmet on a real fixture floor). K12 (`9fb21f4`), BT7a (`6043833`).
- BT1–BT7a, K-waves and ci waves are merged. `.box/limits.json` allows GitHub only; rewards $0; Apache 2.0; reminders off.
- The lab is paused. Unmerged local branches kept for the owner: `wave/A6`, `wave/K7`, `wave/BT7`.
- About 109 `box-bt1-*` temp dirs remain in `%TEMP%` — kitchen leftovers, not on the standing deletion list; left for the owner to rule on.
- **Briefed but uncooked:** BT7b, BT7c (removes things — waits for the owner's "go"), BT8 (owner decisions of 12 October folded in at dispatch), K13 (the bounty tool on Bun — stop-or-go first step) and a possible K-wave for the fixture-world Git floor.

## Next

**BT7b** — the tool owns the life of the bounty. Send `START.md: BT7b`.

Carried findings: confirm/post bookkeeping drifts the approved WIP set (`github-preview-stale`); terminal `undone`; leftover WIP blocks collection apply; unpinned lineCounts git diff; silent answer collection; refusal/exception paths still unquoted; PR closed-by-base-deletion looks like rejection; `log` in `OBJECT_AND_REF_ONLY` is a latent pin-skip for a future `log -p`; `look` on an ended bounty after GC fails as a plain git error; `DB_CHECK_SUITES` is a restated literal that goes stale if `bootstrap` gains a live test; the K14 budget guard can't see its own spy die (`≤`-only assertions — a positive-count anchor would close it); `child_process.fork` is an uninstrumented spawn seam. New from BT6b: solver-planted operand words are invisible at preflight (`find -exec pwn` + a planted `pwn` — landed but not executed on this host; `rundll32 x.dll,f` comma syntax); conservative over-refusals recorded (single-quoted `$(...)`, `bash -c 'cat'`, in-tree data operands) — safe direction only.
