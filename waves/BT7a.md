# BT7a: look, questions, pick the job back up

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT7a` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026 when the owner split BT7. **Scope changed by the owner the same day** (PLAN.md): `look` means seeing what the solver wrote, so it prints the solver's change and creates nothing — the look folder, `unlook`, and everything that exists only to build, list or remove a copy are cut from this wave. A large solution prints its list of files first and the full change on request. This file is the contract; the correction below rewrites the affected "Done when" lines.

## Outcome

A later agent, often a new session, can see each solution as its solver made it, hear solvers' questions, tell new solutions from ones already shown, and know what job to go back to, with the common case one command and no identifier to carry. Nothing about resolving a clash ships in this wave: a clashing `apply` refuses by name exactly as on master, and now names `look`.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: [waves/BT7.md](BT7.md) in full (the brief, both corrections, the three Results and "Parked"); `kitchen/stations/packaging.md`; the parked branch `wave/BT7` at `e1920ca`, which is the source to cut from.
- Do not touch: `wave/BT7` itself; the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- **Cut, not rewritten.** The work is taken from `wave/BT7` at `e1920ca`. The report lists what was taken, what was left behind and why. Left behind: the side copy, `finish`, `cancel`, the staged-merge state, **the look copy, `unlook`, and every test and doc line that exists only to build, list or remove a copy**.
- **Carried over with the "Done when" of BT7 unchanged** for these sections: Solvers' questions are not lost; New and seen; Pick the job back up; and from Everything else: working without an identifier, the shorter `status`, every output naming the next command, the named refusal for a `look` that names a solution that does not exist, and the named refusal for a reply to an issue that is not this bounty's.
- **`look <id> <n>` prints the solver's change and creates nothing.** The change is the diff the solver's pull request makes against the commit the bounty named. No folder, no copy, nothing to remove, nothing new in the record; there is no `unlook`. A large solution prints its list of changed files first and prints the full change on request. The output says that the change was written by the solver and not by the tool, and that the tool has run nothing of the solver's. Nothing a solver wrote is executed at any step, exactly as on master — the diff is computed on fetched objects; nothing is checked out.
- **The owner's own content keeps its filters, as on master:** `create` in a repository with a required clean/smudge filter ships filtered bytes and a clean `apply` leaves a clean `git status`. A test proves each.
- **Apply on a clash:** the refusal master has, unchanged in name, changing nothing, and naming `look <n>` so the agent can read the solution. No side copy is made.
- **Cases that must fail, each a named refusal that changes nothing:** `look` for a solution that does not exist; a reply to an issue that is not this bounty's.
- **Suite cost:** the bounty suite does not take longer per test than on master (528 s for 188 tests), and no timeout above the suite's default is added. If that cannot be met, the cook stops and says what the cost is made of.

## Review lenses

- [x] **Security:** the reviewer attacks the reply command as BT7's passes did (their lists are in [waves/BT7.md](BT7.md)) and tries to make `look` change the owner's tree, index, branch, configuration or refs — `look` is a print path, so the attack is whether solver content in the diff (hostile paths, control characters, text shaped like tool output) can break out of what is printed or reach a filesystem write.
- [x] **User experience:** a fresh agent given a repository with three solutions waiting, none of which clashes with current code, one comment from a solver, and only the tool's output. It must look, choose, apply, and say what job it would go back to. The head chef runs it and gives the reviewer the transcript. The reviewer reports hesitations, misreadings, commands the output had not named, and what was shown and not used.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook, with subtract-before-you-add: start from master, bring across what is needed, and leave the clash path out rather than disabling it.
- The owner/foreign split in `git.ts` (who owns the content decides what may run) is the design that survived review; keep it for the tool's own calls. Do not bring across anything that pins by Git operation.
- Three reviews named things agents did not use: byte counts with "linked object store", "stage 7 of 7", the `github:` and outside-state lines in the short `status`, the answers list beside the attempts list. Take the chance to leave them out of the short form.
- Agents in all six trial runs wanted the current content of the file and what changed on the branch since the named commit. That belongs with the clash path (BT7b); do not add it here.
- The fixture `tests/box/bounty/bt7-ux-fixture.mjs` was built for the copy design; check whether it still works for a print-only `look` — adapt it, or write the smallest fixture that does the UX lens's job. Its `--mid-clash` mode stays behind for BT7b either way.
- The trial fixture `tests/box/bounty/bt7-ux-fixture.mjs` comes across with a mode in which no solution clashes; its `--mid-clash` mode stays behind for BT7b.
- Report at the timebox. Do not run on.
- Not in this wave: the filter program that lives inside the repository and is replaced by a solution (a correction wave of its own), BT7b, BT8 onward.

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
