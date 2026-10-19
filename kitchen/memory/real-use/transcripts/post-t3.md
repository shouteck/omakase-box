REPORT — README "What lives here" update (box-k31 machine-a)

Started: approximately 13:43 MPST, Mon 19 Oct 2026 (no exact timestamp on the first command; the 13:44:50 `date` reading brackets the session).
Finished: approximately 13:45 MPST, Mon 19 Oct 2026.

COMMANDS RUN, IN ORDER
1. `source /c/Users/shout/AppData/Local/Temp/box-k31/env/activate-post-t3.sh && echo "ENV OK" && pwd && ls -la /c/Users/shout/AppData/Local/Temp/box-k31/machine-a` — env activated; noted the script leaves the shell in `C:\Users\shout\Desktop\Projects\private-task-mvp`, so I `cd` explicitly in every later command.
2. `cd .../machine-a && cat README.md && ls -1A` — read the README; listed top level: `.box .devin .git AGENTS.md README.md box box.cmd data docs src tasks test`.
3. `ls -la tasks test .box .devin; cat AGENTS.md box box.cmd` — `tasks/` holds `inventory-count.md` (a drill task brief); `test/` holds `inventory.test.js`; `box`/`box.cmd` are local wrapper scripts for the installed box-bounty tool.
4. `cat tasks/inventory-count.md test/inventory.test.js docs/inventory.md src/count.js data/fruit.txt` — learned the test runs via `node --test` and that `tasks/inventory-count.md` is a per-job brief.
5. `git -c safe.directory=.../machine-a ls-files / status --short / log --oneline -5` — tracked top-level entries are `.box/`, `.devin/`, `AGENTS.md`, `README.md`, `data/`, `docs/`, `src/`, `tasks/`, `test/`; `box` and `box.cmd` are untracked. Also found a pre-existing uncommitted change to `docs/inventory.md` (six → seven fruit) that was already in the working tree before I started — not mine, left untouched.
6. `git check-ignore -v box box.cmd; cat .devin/hooks.v1.json .box/hook-on.json; find .box -type f` — `box`/`box.cmd` are ignored via `.git/info/exclude` (machine-local wrappers); `.devin/` holds Devin hook settings; `.box/` holds the tool's bounty records and hook state.
7. Edited `machine-a/README.md` (one replacement, +15 lines).
8. `cat README.md; for e in $(ls -1A); do grep -qF "$e" README.md ...` — verified all 12 top-level entries are named in the README.
9. `node --test` — repo's own test passes (1 pass, 0 fail); my change is README-only.
10. `date` (13:44:50 MPST) and `git diff --stat` / `git diff` — confirmed final state.

DECISIONS AND WHY
- The task said "covers every top-level entry," so I took it literally rather than only adding `tasks/` and `test/`. The list now covers all 12 entries, including the ignored `box`/`box.cmd` wrappers and `.git/`, so the README is complete under either a working-tree or git-index reading.
- Structure: kept the existing "deliberately tiny project" bullet list and added `tasks/` and `test/` there; added a second short group, "scaffolding around that project," for `AGENTS.md`, `README.md`, `.box/`, `.devin/`, `box`, `box.cmd`, `.git/` — accurate descriptions, and noted `box`/`box.cmd` are Git-ignored so a fresh clone lacks them.
- Left the pre-existing `docs/inventory.md` modification alone — outside this task's scope.

ISSUES / CONFUSIONS
- One `git diff --stat` invocation returned "Not a git repository" (exit 129); re-running from an explicit `cd` worked. Cause unclear — likely a transient shell-cwd quirk; no data affected.
- No tool gave wrong information; `box bounty` was not needed for a one-file doc edit.

CHANGE MADE
- `machine-a/README.md`, "What lives here" section (around line 17): added bullets for `tasks/` and `test/`, plus a scaffolding group covering `AGENTS.md`, `README.md`, `.box/`, `.devin/`, `box`, `box.cmd`, `.git/`. Verified every top-level entry now appears in the file; `node --test` green.
