# BT7b: the tool owns the life of the bounty

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch, after BT7a and BT6b · Branch: `wave/BT7b` · Timebox: 90 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026 from the owner's decisions of that day. It replaces the staged merge of BT7 and the prototype wave that was briefed for it; `finish`, `cancel` and the side copy are not built. The head chef checks it against the Results of BT7a and BT6b before dispatch and corrects names only.

## Outcome

A solution that clashes with current code is no longer a dead end and needs nothing new from the tool: `apply` says what clashes and why, the agent merges with its own Git, and the tool, the next time it runs, sees that a solution is merged and closes the bounty. The same holds however a solution came to be merged. The tool manages the bounty from posted to closed; it does not manage how code is merged.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: PLAN.md ("The journey of one bounty", "Other rules of the product"); [waves/BT7.md](BT7.md) "Parked"; the Results of BT7a and BT6b; `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table; `wave/BT7`; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**Before any code: two facts, reported first**

- What a solver sees on GitHub today after a clean `apply`: is their pull request shown as merged or as closed? If closed, say what it would take for it to show as merged, and make that part of this wave only if it is small; otherwise report it and stop short of it.
- Whether a solution the tool never collected (the agent fetched and merged it itself) can be recognised from the pull requests open against the bounty branch.

**A clash**

- `apply <n>` on a clashing solution refuses by the name it has on master, changes nothing, and states as facts: which files clash, which of the solution's files would merge cleanly, and which commits on the bounty's branch touched the clashing files since the commit the bounty named. It names `look <n>`.
- It says once, in one true sentence, what the tool no longer covers from here: a merge the agent makes itself runs under the owner's own Git settings.
- It offers no command that merges, stages or resolves.

**Recognising a merge**

- Every `bounty` command that reads a bounty's record first checks each open bounty: is the commit of one of its solutions part of the branch the bounty was created on? That branch is in the record.
- If one is, the tool ends the bounty exactly as a clean `apply` does (record, issue, closing comment naming the solution and the commit, the pull request, the bounty branch) and says in one line that it did, whichever command noticed. The saved job context follows, as after `apply`.
- A merge on any other branch closes nothing and is not mentioned.
- If two solutions are both in the branch, the one merged first in that branch's first-parent history is the merged solution. No split, no second outcome.
- The check costs at most one Git process start per open bounty when nothing has changed.
- Never-ship still holds at the door: a solution is checked when the tool collects it, as today. If the merge the tool finds carries a never-ship path that the collected solution did not, the tool says which, as a fact, and still closes the bounty; it does not rewrite the owner's history.
- Run again after closing, every command is quiet about it: closing happens once.

**What the tool requires, the conventional way**

- The tool needs two programs it does not ship: Git, and the GitHub command line (`gh`) signed in. It offers no way of working without them. (It runs on Node; stating that belongs to installing the tool, BT12.)
- **Stated:** `help` and `docs/box-v4/BOUNTY.md` list both as requirements with the least version of each that the tool really uses. The cook finds those versions from the code and proves each with a test, not from memory.
- **Checked where needed, before anything else:** a command checks only for the programs it will use (a command that never reaches GitHub does not demand `gh`), and does so before it writes or changes anything.
- **Refused the usual way:** missing, too old, or not signed in is a named refusal on the error stream with a non-zero exit. One short message: the program, the least version, what was found, and the program's official page (`https://git-scm.com`, `https://cli.github.com`). No step-by-step installation, nothing run, nothing installed.
- The check adds no process start to a command that would have run that program anyway.
- The tests control executable lookup rather than relying on what the host has installed.

**Cases that must fail, each a named refusal that changes nothing**

- `apply` for a solution that does not exist; `apply` on a clash; any command with Git missing; a solution's commit present only on another branch (nothing closes); a record whose branch no longer exists (stated, nothing closes).

**Everything else**

- No new command. No side copy, no staged state, no `finish`, no `cancel`, and nothing built on `undo`.
- Every output names the next command. No step is interactive. Nothing is asked of the agent in words.

## Review lenses

- [x] **Security:** the reviewer tries to make the tool close a bounty that was not merged (a commit with the same message, the same tree, a cherry-pick, a merge on another branch, a rewritten branch, a record edited to name another branch or commit), to make it close the wrong one of two, and to make a comment or solution text steer the closing. It checks that a missing or old Git is refused by every command, with nothing written first.
- [x] **User experience:** a fresh agent given a repository with three solutions waiting, the best of which clashes, and only the tool's output. It must look, choose, get the chosen solution into the current branch its own way, and say what job it would go back to. The head chef runs it and gives the reviewer the transcript. The reviewer reports what the agent did after the refusal (merged with Git, copied by hand, gave up), whether the bounty ended closed, and every hesitation.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. This is a small wave; if it stops being small, stop and say why.
- "Merged" is a fact Git answers exactly (`merge-base --is-ancestor`). Do not infer it from text, trees or similarity.
- A solution copied by hand is not merged and is not recognised. That is the owner's rule: the merged solution earns the reward, and the terms say so.
- A public action triggered by a reading command is deliberate (owner, 12 October 2026): a lifecycle that waits for a second command is left half done when sessions end. Say plainly that it happened.
- Report at the timebox. Do not run on.
- Not in this wave: removing commands (BT7c), the contract's terms in the issue (BT8, BT10), anything about a reward (BT11).

---

## Result

- Worker: (see branch history) · Reviewer: the pass (fresh agent, did not write the code)
- Commit: `a0c895c145a3a1d47e07496e4d4220fb7969aa99`
- Verify: `verify a0c895c PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 493s` — confirmed on disk at `.kitchen/runs/2026-10-12T16-31-55-714Z-a0c895c` (summary.json: sha match, clean tree, all steps exit 0, 260+142 tests). Relied on per role; no doubt stated, no `--fresh` rerun. Reviewer separately ran the added `tests/box/bounty/bt7b-review.test.ts` (8 tests): 7 pass, 1 fails and is the finding below.
- Verdict: **FAIL** · Level: test-verified
- Lenses:
  - **Security — one attack succeeded.** Could NOT make it close a non-merged bounty: a commit with the same message (cherry-pick), the same tree (`commit-tree` of the solution tree), or a merge on another branch all leave the record open — ancestry by sha only, and text/comments/PR metadata never enter the decision. A rewritten branch simply changes what ancestry answers. **Could** make it close the wrong one of two: see BT7b-1 — a solution reaching the branch through a nested side-branch merge wins over a solution merged onto the branch first. A record hand-edited to name another branch closes on that branch (the record is the tool's own state — convention, not confinement; a same-sha-in-two-records edit likewise steers). A `merge -s ours` closes with no solution bytes landed — ancestry is the chosen fact, same class as merge-then-revert; documented boundary, not a defect. Missing Git: `status`, `look`, `apply` all refuse `git-missing` exit 3 with the URL, record + OPEN byte-identical (nothing written first). Old Git: `2.39.9` refuses `git-too-old` naming 2.40 (message reports `found git 2.39` — patch digit dropped, nit; misleads only if least ever becomes a patch version). Missing/old/unsigned `gh` refuse by name per worker's tests. The probe costs: exactly 1 `rev-list` per open bounty with candidates when nothing changed (rev-list is object/ref-only, no config read) + 1 `git version` per process — the ≤1-per-bounty claim holds. **But** the brief's "the check adds no process start to a command that would have run that program anyway" does not hold literally: every git-using command pays +1 `git version`, every gh command +1 `gh version` (K14 budgets all raised +1; e.g. `describe` 1→2, `look` 4→6). The implementable reading — no spawn for commands that never run the program — holds (`help`=0, presence via PATH lookup); a version cannot ride a `git config` spawn. Flagged for the head chef, not counted as a defect.
  - **User experience.** Both fresh agents completed `answer → look → apply → closed` and named the saved job; neither hit the clash refusal — the pre-collection conflict report (`merging onto the current branch would conflict in "src/money.js"`) told them the clashing solution was not the best before `apply` was ever reached, which is arguably the tool working. Post-refusal path driven by the reviewer through the real CLI: conflicted `apply` exits 0, names the clashing files (quoted, as on master), the clean set, the owner commits touching them since the shared commit, the one true sentence about the owner's own Git settings, and names `look` + `reject` — no "apply again". Agent's own `git merge` → next `status` printed the one-line close, the saved job context, closed the issue with a `merged` comment, removed the bounty branch; the next command was quiet. Hesitations (transcripts): `bounty --help` vs `help` stumble both runs; no per-attempt reject wanted; `.box/` record left uncommitted — journey 2's own commit `13e1699` was housekeeping consistent with the tool's "commit it with the project", not needed for the close.
- Method: read the diff + station card + fixture/support; ran every named attack as real Git in fixture repos (`tests/box/bounty/bt7b-review.test.ts`, committed on this branch); confirmed the worker's verify record on disk.
- Findings and limits:
  - **BT7b-1 (the FAIL):** `merged.ts` `entryCommit` uses `rev-list --first-parent --ancestry-path <cand>..<branch>`; when a candidate reached the branch only via second-parent edges deeper than one hop (solution merged into a feature branch, feature branch merged to main — an ordinary flow), that rev-list is EMPTY, so `entryCommit` returns the candidate sha itself, `chainIndex` misses, and `?? chain.length` sorts it as the deepest entry — "merged first". Result: the wrong solution of two is named (attempt 2 chosen over the earlier-merged attempt 1, reproduced), `event.merge` records the solution sha instead of the landing merge commit, and the never-ship extras check diffs `merge^1` of the wrong commit (the side merge's extras go unreported). Reproduced by hand: `rev-list --first-parent --ancestry-path S2..main` prints nothing where plain `--ancestry-path` prints `[outer-merge, side-merge]` — and even the unfiltered variant's oldest element is the side-branch merge, not the first-parent entry. The correct entry is the deepest first-parent commit that descends from the candidate (e.g., per-candidate `merge-base --is-ancestor` over the chain, paid only on the close path).
  - Nit: `git-too-old` reports found major.minor only ("found git 2.39" for a 2.39.9 binary).
  - Nit: a scan-close during a non-status command prints the one line; the saved-job context follows only in that command's own output (`status` shows it; `look` would not re-render it).
  - Nit: the conflicted-apply `commits` block prints commit subjects unescaped; solver-authored subjects reach it only after their commits are already on the branch (at which point the bounty closes anyway).
  - Observation, consistent with BT7: `apply` on a clash exits 0 — the merge is refused (aborted byte-identical) but it is an outcome line, not a `refused (name)` exit 3.
  - Pre-code facts check out: clean-apply PR shows closed-not-merged on GitHub via branch removal (station card BT6a nit, documented, out of scope); uncollected PR heads are candidates via `seenPullRequests` (verified in code and test).
- Merged: no — FAIL · Resources removed: scratch `bt7b-review.test.ts` kept on the branch as the reproduction; all fixture dirs are self-cleaning `box-bt1-*` temp; `$TEMP/bt7b-topo`, `$TEMP/bt7b-review-run*.log` removed at close.
- Reflect: the attack the lens demanded found a real wrong-attribution bug; the empty `--ancestry-path` under `--first-parent` for second-parent entries is the trap to remember — "find the merge that carried X in" is not the same as "the oldest descendant of X on the chain".
