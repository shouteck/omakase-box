# BT6b: nothing a solver wrote runs at a merge, in every configuration

Milestone: BT · Station: packaging · Base: master at dispatch, after BT7a · Branch: `wave/BT6b` · Timebox: 90 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026. A correction for two defects that BT7's reviews found on master, both there since BT6a. The head chef checks names against master at dispatch.

## Outcome

"The tool never runs anything a solver wrote" is true of the tool's own merge whatever the owner's Git configuration is, and what the tool publishes of a filtered file is its filtered form.

## The two defects, as reproduced by BT7's passes

1. **A filter program inside the repository.** Owner configuration `filter.own.clean`/`smudge = node tools/filter.cjs`, committed `*.dat filter=own`, tracked `tools/filter.cjs`. A solution replaces `tools/filter.cjs` and changes a `.dat` file that Git writes after it. On a clean `apply`, Git writes the solver's program and then runs it on the owner's machine; `undo` of that merge does the same; any later Git command on that tree does too. Details: [waves/BT7.md](BT7.md), "Result, second pass", pre-existing finding.
2. **Unfiltered bytes published.** `post --to github --with-changes` pushes the working-tree bytes of a clean-filtered file in the work-in-progress commit, where `create` ships the filtered form. In a repository that encrypts with a filter this publishes plaintext. Details: [waves/BT7.md](BT7.md), first Result.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: the two Results named above; `kitchen/stations/packaging.md`, the BT7 lesson; the owner/foreign split in `packages/box-bounty/git.ts` as BT7a landed it.
- Do not touch: the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- **Both defects are reproduced first,** through the built CLI, as tests that fail on master.

**Defect 1**

- When landing a solution on the owner's tree could run a program that the solution supplies or changes, `apply` refuses by name before the working tree, index or branch is touched, and states as facts which configured command and which path. The agent may still merge with its own Git; that is its choice and outside the tool.
- **The rule is sound, not clever.** It must not depend on guessing what a program reads. A program the solution leaves unchanged that calls a second file the solution does change is the test that decides it. A conservative rule that refuses more than strictly necessary is acceptable; a narrower one is acceptable only with that test green. Where the tool cannot tell whether a configured command resolves inside the working tree, it refuses.
- It covers every channel Git runs at a merge or checkout from the owner's configuration: clean, smudge and `process` filters, merge drivers, and whatever else the cook finds by listing them from Git's documentation rather than from memory. The list is in the report.
- The ordinary case is unchanged and no slower by more than one Git process start: no such configuration, or a filter whose program is outside the repository (`git-lfs`, a system binary), lands as today, with the owner's filters applied. A test proves each.
- `undo` gets the same refusal for as long as `undo` exists. Nothing new is built on it.

**Defect 2**

- A work-in-progress commit made by `post --with-changes` holds, for every file under a clean filter, the same bytes `create` would ship. A test with a required clean/smudge filter reads the pushed commit and compares.
- If the filtered form cannot be produced (the filter fails or is missing), the post is refused by name and nothing is pushed.

**Cases that must fail, each a named refusal that changes nothing:** the reproduction of defect 1; the indirection case; a merge driver in the tree that the solution changes; a configured command the tool cannot place inside or outside the tree; defect 2 with a failing filter.

## Review lenses

- [x] **Security:** the reviewer tries to get a solver's program run by the tool's own `apply` and `undo` in a repository configured against it: relative and absolute program paths, a wrapper (`sh -c`, `node -e`, `cmd /c`), a program reached through another, a path with different case or a short name on Windows, attributes supplied by the solution that select an owner's filter for new files, and the owner's global configuration naming a path that lands inside the repository. It says for each whether the tool refused, and checks nothing was written before a refusal.
- [ ] **User experience:** not applicable beyond the refusal naming its next step.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Bug-fix playbook: reproduce, then the smallest sound change.
- BT7's second cook judged there was no sound fix by matching configuration against the solution's paths, because of indirection. That is why refusing is the expected shape, not rewriting what Git runs.
- Do not switch filters off to make the merge safe: that was BT7's first blocker, and it ships wrong bytes.
- Report at the timebox. Do not run on.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
