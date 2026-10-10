# BT3a: report, do not judge

Milestone: BT · Station: packaging (also evidence) · Base: master at the commit that adds this file · Branch: `wave/BT3a` · Timebox: 120 minutes; at expiry, report partial findings and stop

## Outcome

When an answer comes back, the agent does not have to work out whether it is any good, and the tool does not pretend to know. The tool checks the answer and writes **a short report of facts**. The decision to accept or reject is left to the agent or the owner, is recorded, and can be undone.

This changes two things BT3 shipped, on the owner's decision of 10 October 2026: a passing answer is no longer applied automatically, and a failing answer no longer ends the bounty. Read "The design rule", "What is settled" and "Rules of the product" in `PLAN.md` first.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `PLAN.md`; `waves/BT3.md` Result (what the return path does and the three rounds it took); `kitchen/stations/packaging.md` and `kitchen/stations/evidence.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding and the merge boundary that BT3's fix rounds closed, except to call them. `export`, `submit`, `verify`, `trace`. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.
- **The report states facts and only facts.** After `answer`, and again whenever `status` shows that bounty, the agent sees, in a few lines:
  - the check: what it did before (failed, with its exit) and what it does on the answer;
  - the guard, if one was declared (see below): still passes or not;
  - the change: files changed, added and deleted, with counts, and how many lines;
  - current code: whether the answer would merge cleanly onto the branch as it is now, and which paths conflict if not, found without touching the working tree or the index;
  - flags: each a plain observation. At least: the answer edits a file the check command names or a file marked as a test by a stated rule; the answer adds files; the answer deletes files; the change is large against a stated size; the check passed on the untouched snapshot when re-run (so the pass says nothing).
  - **what was not checked,** always: one sentence saying the report shows the stated commands' results and nothing about behaviour they do not cover.
  - the next command, written out.
- **The words are policed.** A test asserts the report never contains "correct", "safe", "good", "recommended", "should accept" or "should reject", in any outcome. The doc page says why: a wrong fact is a bug we can find; a wrong verdict misleads and cannot be traced.
- **A passing answer waits for a decision.** A mechanical answer whose check passes lands at `verified` and stops. `apply` is a separate command. The earlier automatic apply is removed; the doc page says the owner's limits (a later wave) may switch it back on for clean mechanical passes.
- **A failing answer does not end the bounty.** It is recorded as an attempt with its result (check failed, or could not run, with exit and output tail as today) and the bounty returns to `posted`, still open. `reject` and `withdraw` end it as before.
- **Several answers.** Each `answer` is kept as its own attempt with its report. `status` lists a bounty's attempts with those that pass first. `apply` names which attempt when there is more than one that could be applied. Applying one ends the bounty and removes the others' refs.
- **A guard, optional, at `create`:** `--guard -- <command>` declares what must keep passing. `create` runs it on the shipped set and refuses if it does not pass today (a named refusal, distinct from the check's). `answer` runs it after the check and reports the result as a fact. A bounty without a guard says so in its report.
- **Accepting can be undone.** `box bounty undo <id>` reverses the merge that `apply` made, as a new commit that names the bounty, and records it. It refuses by name when the merge is no longer on the current branch's history or the reversal would not apply cleanly, and changes nothing in that case. A test applies, undoes, and shows the tree equal to before the apply.
- **The decision is recorded:** the record's history says which command ended the bounty, on which attempt, and when.
- **Cases that must fail:** an answer that edits the test named by the check passes the check and is flagged, not blocked; an answer to a bounty whose check passes on the untouched snapshot is flagged as saying nothing; a conflicting answer reports the conflict paths in the report and `status` repeats them (BT3's known gap).
- Every new outcome is a named state with a next step. Nothing prints nothing.
- Works on this Windows host from Git Bash and PowerShell; the suites still pass on the off-machine runner (host-only tests marked as K10 did, by the platform they need).

## Review lenses

- [x] **Security:** the report and the new attempt records must not become a way round BT3's boundary. The reviewer re-runs BT3's attacks against the new flow (a never-ship path in an answer, a doctored manifest, an ignored file under a touched path, line-ending settings) with several attempts present, and tries to make `undo` damage a working tree with uncommitted work.
- [x] **User experience:** the reviewer gives a fresh agent only the doc page and a repository with one answered bounty, and asks it to decide. It reports whether the agent could say what was checked, what was not, and what to run next, and whether anything in the report read as advice.
- [x] **Measurement fairness:** the facts in the report. For each line of a report the reviewer names the command or comparison it came from and re-derives it by hand on one answer; a line it cannot trace is a finding.

## Notes for the worker

- Feature playbook. The merge boundary took BT3 three rounds; do not re-open it. Build the report from what `answer` already computes, add the dry merge check and the flags, and change only where the flow stops.
- The dry merge check must leave the working tree, the index and the current branch byte-for-byte as they were. BT3's packaging-card notes on saving and restoring bytes apply.
- Flags are observations for a reader, deliberately eager. A false alarm costs a minute; a missed one costs a wrong fix. No flag blocks anything.
- Records written before this wave must still load; say how an older record with a single answer reads.
- Out of scope, each a later wave: the one line of why, defaults and evidence gathering at `create`, `help` (BT3b); the description, the rules lines, the owner's limits and reminders (BT4); anything that sends a bounty outside (BT6).
- Everything the wave creates in the temp folder is named for the wave and removed.

---

## Result

- Worker: · Reviewer: pass (fresh agent, not the cook) — Windows host, Git Bash + PowerShell smoke; Claude.
- Commit: 5968d84 (wave/BT3a, reviewed `git diff master...5968d84`; tree clean).
- Verify: `node scripts/verify.mjs test:box-bounty test:box-package` exit 0 on 5968d84 — all four steps reused the recorded PASS at 2026-10-10T07-44-45Z on this exact SHA with clean tree (358s run: check, build, test:box-bounty 98 tests incl. all 17 new report.test.ts tests, test:box-package). Pass's own invocation 2026-10-10T07:54:19Z.
- Verdict: PASS · Level: ui-verified (built CLI exercised end-to-end on a scratch repo, plus the green suite).
- Lenses:
  - Security: PASS — all four BT3 attacks re-ran live against the new flow with attempts present and were named refusals changing nothing: `.env`+`secrets/` in the returned repo/ → `answer-never-ship`; a doctored `bounty.json` check → `manifest-tampered`; an ignored `node_modules/injected.js` at a touched path → `apply-worktree-dirty` (file preserved); whole run under host `core.autocrlf=true` — merges and undo land, CRLF-clean files draw no false refusal. `undo` attacks: staged index → `undo-index-staged`; uncommitted bytes at a touched path → `undo-worktree-dirty` (preserved); merge removed by `reset --hard` → `undo-not-on-branch`; diverged file → `undo-conflict` naming path and merge sha; never-applied → `not-applied`; repeat → `already-undone`. BT3's merge boundary is intact: never-ship table, snapshot identifier and manifest sha binding untouched; `snapshotBytes`/`restoreBytes`/`merge --abort`/porcelain-`-z` boundary preserved and now shared with `undo` (whose revert gets the same boundary plus an index-clean gate).
  - User experience: PASS — cold read of `status`/`answer` output on a scratch repo: a fresh agent can say what ran (check argv, exits at create and on the answer, guard, change counts, merge read with conflict paths), what did not (always-present `not checked:` line) and the exact next command. Flags are observations; nothing reads as advice. Verdict-word test covers verified/check-failed/answered/conflict reports plus status — one shared renderer covers the check-unrunnable path by construction (its dynamic parts are argv and exits only).
  - Measurement fairness: PASS — every report line on a real answer re-derived by hand: check exit at create from `manifest.verification.check` (re-ran on the untouched shipped set → exit 1); exit on the answer (re-ran inside answer `repo/` → 0); `guard:` from `bounty.json` (null); `change:` counts from the recorded attempt fields vs manifest sha256 comparison; line counts from `git diff --numstat` base→answer (1/1); `current code:` from a manual `git merge-tree --write-tree` (exit 0 clean; `src/app.py` named on the conflict case); each flag re-derived, including the baseline re-run proving the env-marked check exits 0 on the untouched snapshot — so the "says nothing" flag is true. No untraceable line.
- Method: prove-it-works applied to the real artifacts — scratch repo end-to-end through the built CLI, hand re-derivation of report facts, live refusals. No cook-cited principles to check beyond it.
- Findings and limits: (trivial) the cook left `bt3a-*.log` scratch files in %TEMP% — removed at close; the wave note says wave temp items are removed. (cosmetic, pre-existing BT3) after an aborted apply under autocrlf=true `git status` stat-flags the touched file while `git diff` is empty — `restoreBytes` rewrites identical bytes. (limits) byte-equality after apply/undo is asserted in-suite only under pinned `autocrlf=false` — on the real host the touched file comes back CRLF-smudged per the repo's own convention (`HEAD^{tree}` identical, git clean); the word-police test does not exercise the check-unrunnable outcome and a solver-controlled check tail can carry a banned word inside the quoted tail block; `apply <id> <n>` deliberately permits a failed attempt by name.
- Merged: pending head chef · Resources removed: all `bt3a-*` scratch under %TEMP% removed by the pass.
- Reflect: —
