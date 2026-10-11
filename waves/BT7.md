# BT7: look, choose, resolve a clash, pick the job back up

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT6's second run is merged · Branch: `wave/BT7` · Timebox: 180 minutes; at expiry, report partial findings and stop

**Pre-brief,** written before BT6a was planned. From BT6a a bounty on GitHub is an issue on the real history with an ordinary branch, not a snapshot: where this file says "snapshot", "shipped set" or "as the solver saw the code", read the commit the bounty names and the bounty branch. The head chef revises it against BT6a's Result before dispatching. Looking at a solution and staging a clash both become simpler with real history. Written by the CTO on 11 October 2026, before BT6's second run. The outcome and the acceptance are settled with the owner. Command names, state names and file paths below follow the design discussion and may not match what BT6 leaves; the head chef revises this file against BT6's Result before dispatching, and says in the pre-cook card what changed.

## Outcome

A later agent, often a new session, can do the whole second half of a bounty unaided: see each solution as the solver saw the code, choose one, bring it onto current code even when it clashes, and know what job to go back to. Its working code is never touched until the last step, and the common case stays one command.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `PLAN.md` ("The journey of one bounty" steps 8 to 15, "What is settled", "The three hard stops"); `waves/BT6.md` Result; `waves/BT3.md` and `waves/BT3a.md` Results (the merge boundary, the dry merge, undo); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding. The merge boundary is extended here, not rewritten: everything BT3's rounds closed still holds. `export`, `submit`, `verify`, `trace`. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.

**Look**

- `look <id> <n>` gives the agent solution `n` as the solver saw it: a folder holding the shipped snapshot with the solver's change in it, and the change itself to read. Nothing can clash there. The output says where the folder is, that its contents were written by the solver and not by the tool, that the tool has run nothing in it, and how to remove it.
- The folder is outside the working tree, named for the bounty and the attempt, and listed in the record. `status` shows it while it exists. Looking twice reuses it. Removing it is one command and leaves nothing.
- Looking never touches the working tree, the index or the current branch.

**Apply, when it merges cleanly**

- Unchanged for the agent: `apply <id> <n>` merges, closes the loop outside and names `undo`. One command, as today.

**Apply, when it clashes**

- `apply` no longer ends at the refusal. It stages the merge in a side copy (a separate working copy on its own branch, named for the bounty), leaves the conflicts marked the standard Git way, and stops with a named state that says: where the side copy is, which files need resolving, the command that finishes and the command that cancels. The working tree, the index and the current branch are byte-for-byte as they were.
- `finish <id>` refuses by name, changing nothing, while a conflict marker or an unmerged path remains, and says which. Once resolved it completes the merge onto the current branch as one merge naming the bounty and the attempt, records that the agent resolved a clash and in which files, closes the loop outside exactly as a clean `apply` does, and removes the side copy.
- `cancel <id>` removes the side copy and the staged merge and leaves no trace; the bounty is as it was before `apply`.
- If the current branch moved while the side copy was open, `finish` says so as a fact and either completes cleanly or stops with the new clash staged the same way. It never forces.
- `undo` works after a resolved merge exactly as after a clean one.
- **It survives the session ending.** A staged merge is in the record: `status` and the open-bounties line show that a merge is half done, where, and the two commands. A fresh agent can finish or cancel it from that alone.
- Never-ship still holds at the end: a resolution that introduces a never-ship path is refused at `finish`.

**Pick the job back up**

- `create` records, with nothing asked of the agent, where the work stood: the branch and commit, and the files changed against the base. It accepts at most one optional line on what the agent was in the middle of. This stays in the project's record and is never part of what is posted; a test proves it is absent from the listing, the pushed branch and the issue.
- `status <id>` shows it to the later agent, and the output after a successful `apply` or `finish` repeats it under a plain heading, so the next thing the agent reads is the job it can return to.
- Records written before this wave load and say that this was not recorded.

**Solvers' questions are not lost**

- A solver who is unsure comments on the issue, and by rule a stranger's text is not put in front of the agent unasked. So `status` states, as a fact, how many comments the issue has from accounts other than the owner's and when the latest was made, and names the command that shows them. That command prints them marked as written by others, not by the tool. The hook (BT9) may count a new comment as an event; it never prints one.
- Answering is the agent's own choice and its own words; the tool offers a command that posts a reply under the owner's sign-in and records that it did.

**Everything else**

- **Cases that must fail, each a named refusal that changes nothing:** `look` or `apply` for an attempt that does not exist; `apply` while another merge for the same bounty is staged; `finish` and `cancel` with nothing staged; `finish` with markers left; a side-copy path that already exists and is not ours (never overwritten, never deleted).
- Nothing from a solution is executed at any step, including in the side copy: BT6's sentinel tests are extended to `look`, the staged merge, `finish` and `cancel`.
- Every output names the next command. No step is interactive.
- The description and help stay as short as they are now; the doc page gains the clash and resume sections. An agent that never meets a clash never needs to read about one.
- Works on this Windows host from Git Bash and PowerShell, and on the off-machine runner.

## Review lenses

- [x] **Security:** the reviewer attacks the side copy and the look folder. A solution with paths that escape the folder (`..`, absolute, junctions, case tricks on Windows); a solution carrying hooks, filters, merge drivers or a submodule; a side-copy location that is a junction to somewhere else; a `finish` after the reviewer plants a never-ship file in the resolution; a `cancel` pointed at a folder the tool did not create. It tries to make `apply`, `finish` or `cancel` change or delete uncommitted work in the main working tree. It re-runs BT3's attacks through the staged path.
- [x] **User experience:** this is how the wave is accepted. A fresh agent is given a repository with three solutions waiting, one of which clashes with current code and is the best of the three, and only the tool's own output: no doc page, no hint. It must look, choose, resolve the clash, finish, and say what job it would go back to. A second fresh agent is started after the first is stopped halfway through a clash, and must finish or cancel from the record alone. The reviewer reports where each hesitated, what it misread, and every command it ran that the output had not named.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Go deep on the merge model before writing: what the three trees are (the shipped snapshot, the solution, current code), and that a clash is only where the solver and the owner changed the same lines.
- Git already has what the side copy needs (a linked working tree on a named branch is one way). Prefer that to copying files by hand; say which you chose and why. Whatever it is, the tool creates it, records it, and removes it by exact path.
- The clean path must not get slower or noisier because the clash path exists.
- On a large repository a side copy costs disk and time: the stopping message says what was created and how big it is.
- Do not add a third way to look at a solution. Two views (as the solver saw it, on current code) is the limit the owner agreed.
- Out of scope, each a later wave: standing rules (BT8), the hook (BT9), the open format (BT10). Combining parts of two solutions is the agent's own work and not a feature.
- Everything the wave creates in the temp folder is named for the wave and removed at close.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
