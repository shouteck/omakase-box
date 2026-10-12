# BT7b-proto: how a resolved clash gets back onto current code

Milestone: BT · Station: packaging · Base: master after BT7a · Branches: `proto/BT7b-<letter>`, one at a time · Timebox: 60 minutes per attempt; at expiry the cook stops and reports

**Pre-brief.** Written by the CTO on 12 October 2026 when the owner split BT7. A prototype wave under "Design decisions with no precedent" in KITCHEN.md: the code is thrown away, the idea is kept, and the real BT7b brief is written from the winner. Revised against BT7a's Result before dispatch.

## Outcome

One page that says which way of carrying an agent's resolution from a side copy onto the owner's current branch survives the attacks that failed BT7, with the evidence, so that BT7b can be briefed once and reviewed once.

## Scope

- Write: `proto/BT7b-<letter>` branches only; nothing merges to master. The comparison goes into this file's Result.
- Read for context: [waves/BT7.md](BT7.md), the three Results and "Parked"; `kitchen/stations/packaging.md`, the BT7 lesson; BT7a as merged.
- Do not touch: master, `wave/BT7`.

## The attempts

Each does the same narrow thing: a solution that clashes is staged in a side copy, the resolution is carried back as one merge on the owner's branch, and a half-done state can be finished or cancelled by a new process. Nothing else from BT7 (no output polish, no docs).

- **A. The resolution is a commit.** The agent commits in the side copy; the tool takes that commit's tree, by object, and merges it with its own pinned Git. No file is read back from the copy's folder.
- **B. Files are read back, checked on the landing side.** As `e1920ca`, but the tree that lands is built and judged entirely on the owner's side: never-ship, unsafe paths and byte form are checked on that tree, and the copy is written in the same byte form it is read in.
- **C. No side copy.** The tool writes the clashing files with standard markers, and the two sides beside them, into a folder of plain files that is not a repository; the agent edits; the tool builds the merge tree from those bytes with `git hash-object` and `merge-tree`. Plain Git has nothing to run there.

The head chef may drop or replace one attempt at dispatch if BT7a's Result makes it pointless.

## Done when

- Each attempt is run against the same checks, written once and shared, and each result is recorded as pass, fail or not reached:
  - a never-ship file planted in the resolution, including one the copy's own Git is told to ignore;
  - a file nobody touched, under `core.autocrlf=true` with `-text`, and under `working-tree-encoding`, lands byte-identical;
  - a repository with a required clean/smudge filter lands the right two byte forms;
  - the owner's filter program lives in the tree and the solution replaces it: nothing of the solver's runs while the clash is staged, by the tool or by plain Git typed in the copy;
  - a solution carrying a bare repository's layout in a folder;
  - the owner's branch moves while the clash is open, with an owner `gc --prune=now` in between;
  - a process sits in the copy when the tool removes it; the copy is deleted by hand; a foreign folder appears at its path;
  - uncommitted and staged owner work in the main tree survives every step byte for byte;
  - a new process finishes, and another cancels, from the record alone.
- The Result names the winner in one sentence, what it costs the agent (what it must type that the others do not ask for), what it leaves open, and the count of Git process starts for a staged clash and a finish.
- Every prototype branch and folder is removed at close.

## Review lenses

- [x] **Security:** the pass reruns the shared checks on the winner and adds two attacks of its own.
- [ ] **User experience:** not here; it returns in BT7b.
- [x] **Measurement fairness:** every attempt faced the same checks, every check is counted including those not reached, and a timebox expiry is shown as such, not as a fail of the idea.

## Notes for the worker

- Prototype playbook. One attempt per cook, one at a time on this machine. Smallest code that can face the checks.
- Report at the timebox. Do not run on.

---

## Result

- Worker: · Reviewer:
- Attempts and checks:
- Winner:
- Findings and limits:
- Resources removed:
- Reflect:
