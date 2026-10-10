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

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
