# BT7: look, choose, resolve a clash, pick the job back up

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT6a is merged · Branch: `wave/BT7` · Timebox: 180 minutes; at expiry, report partial findings and stop

**Brief, written ahead.** By the CTO on 11 October 2026, while BT6's second run was cooking, and rewritten the same day for the way BT6a posts a bounty: an issue on the real history, with an ordinary bounty branch and solutions as ordinary pull requests. The outcome and the acceptance are settled with the owner. Command names, state names and file paths follow the design discussion; the head chef checks them against the Results of BT6 and BT6a before dispatching, corrects names only, and says in the pre-cook card what changed.

## Outcome

A later agent, often a new session, can do the whole second half of a bounty unaided: see each solution as its solver made it, choose one, bring it onto current code even when it clashes, hear solvers' questions, and know what job to go back to. Its working code is never touched until the last step, and the common case stays one command.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `PLAN.md` ("The journey of one bounty" from where a later agent learns of it, "What is settled", "The three hard stops", "Other rules of the product"); `waves/BT6a.md` Result (how a solution is fetched, reported and merged from real history); `waves/BT6.md` Result (what "nothing is run" and "a stranger's words" were proved against); `waves/BT3.md` and `waves/BT3a.md` Results (what protects the owner's working tree, the dry merge, undo); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table; the protections of the owner's working tree, index and branch, which are extended here, not rewritten; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`. The local-folder path is left as it is.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**Look**

- `look <id> <n>` gives the agent solution `n` as its solver made it: a separate working copy checked out at that pull request's commit, and the change itself to read against the commit the bounty named. Nothing can clash there, because current code is not involved.
- The output says where the copy is, that its contents were written by the solver and not by the tool, that the tool has run nothing in it, and how to remove it. If the agent runs something there, that is its own choice; the tool states that fact once and offers no command that runs anything.
- The copy is outside the main working tree, named for the bounty and the solution, and listed in the record. `status` shows it while it exists. Looking twice reuses it. Removing it is one command and leaves nothing.
- Looking never touches the main working tree, the index or the current branch.

**Apply, when it merges cleanly**

- Unchanged for the agent: `apply <id> <n>` merges, closes the loop outside and names `undo`. One command.

**Apply, when it clashes**

- `apply` no longer ends at the refusal. It stages the merge of that solution onto current code in a side copy (a separate working copy on its own branch, named for the bounty), leaves the conflicts marked the standard Git way, and stops in a named state that says: where the side copy is, which files need resolving, the command that finishes and the command that cancels. The main working tree, the index and the current branch are byte-for-byte as they were.
- `finish <id>` refuses by name, changing nothing, while a conflict marker or an unmerged path remains, and says which. Once resolved it completes the merge onto the current branch as one merge naming the bounty and the solution, records that the agent resolved a clash and in which files, closes the loop outside exactly as a clean `apply` does, and removes the side copy.
- `cancel <id>` removes the side copy and the staged merge and leaves no trace; the bounty is as it was before `apply`.
- If the current branch moved while the side copy was open, `finish` says so as a fact and either completes cleanly or stops with the new clash staged the same way. It never forces.
- `undo` works after a resolved merge exactly as after a clean one.
- **It survives the session ending.** A staged merge is in the record: `status` and the open-bounties line show that a merge is half done, where, and the two commands. A fresh agent can finish or cancel it from that alone.
- Never-ship still holds at the end: a resolution that introduces a never-ship path is refused at `finish`.

**Solvers' questions are not lost**

- A solver who is unsure comments on the issue, and by rule a stranger's text is not put in front of the agent unasked. So `status` states, as a fact, how many comments the issue has from accounts other than the owner's and when the latest was made, and names the command that shows them. That command prints them marked as written by others, not by the tool.
- Answering is the agent's own choice and its own words. The tool offers a command that posts a reply under the owner's sign-in and records that it did.

**New and seen**

- The record notes, for each solution, when the tool first showed it to an agent. That is all "seen" means, and the agent does nothing to cause it. Every listing marks each solution as new or as seen since a given time. BT8 uses the same fact for the line in the instruction files and BT9 for the hook, so a solution is announced once and never again.

**Pick the job back up**

- `create` records, with nothing asked of the agent, where the work stood: the branch and commit, and the files changed against the last commit. It accepts an optional short note on what the agent was in the middle of. This stays in the project's record and is never published; a test proves it is absent from the issue, the bounty branch and every comment the tool posts.
- `status <id>` shows it to the later agent, and the output after a successful `apply` or `finish` repeats it under a plain heading, so the next thing the agent reads is the job it can return to.
- Records written before this wave load and say that this was not recorded.

**Everything else**

- **Cases that must fail, each a named refusal that changes nothing:** `look` or `apply` for a solution that does not exist; `apply` while another merge for the same bounty is staged; `finish` and `cancel` with nothing staged; `finish` with markers left; a side-copy or look-copy path that already exists and is not ours (never overwritten, never deleted); a reply to an issue that is not this bounty's.
- Nothing from a solution is executed at any step, including checking it out into a copy: the sentinel tests from BT6 and BT6a are extended to `look`, the staged merge, `finish` and `cancel` (hooks, filters, merge drivers, a submodule, a checkout-time attribute).
- Every output names the next command. No step is interactive.
- **Less to carry.** When only one bounty is open, which is the usual case, every command works without its identifier (`look 1`, `apply 1`); with several open, the tool asks which, by name. `status` for a bounty shows first what an agent needs to act (its state, how many solutions, which are new and which were seen before and since when, what needs doing, the next command), and the full history and each solution's full report only when asked for.
- The description and help say no more than they must; the doc page gains the look, clash, questions and resume sections. An agent that never meets a clash never needs to read about one. No line count is enforced (owner, 11 October 2026: a fixed limit could damage the product by cutting what an agent needs). The measure is whether a fresh agent got what it needed without wading: the reviewer judges that, and reports anything shown that the agent did not use.
- Works on this Windows host from Git Bash and PowerShell, and on the off-machine runner. Long paths on Windows: a separate working copy of this repository has failed to check out when placed deep in the temp folder, so the tool chooses a short location and says where.

## Review lenses

- [x] **Security:** the reviewer attacks the two kinds of copy and the reply command. A solution with paths that escape the copy (`..`, absolute, junctions, case tricks on Windows, names Windows reserves); one carrying hooks, filters, merge drivers or a submodule; a copy location that is a junction to somewhere else; a `finish` after the reviewer plants a never-ship file in the resolution; a `cancel` pointed at a folder the tool did not create; a comment by another account shaped to look like the tool's own output or to carry instructions. It tries to make `apply`, `finish` or `cancel` change or delete uncommitted work in the main working tree.
- [x] **User experience:** this is how the wave is accepted. A fresh agent is given a repository with three solutions waiting, one of which clashes with current code and is the best of the three, one comment from a solver asking a question, and only the tool's own output: no doc page, no hint. It must look, choose, resolve the clash, finish, and say what job it would go back to. A second fresh agent is started after the first is stopped halfway through a clash, and must finish or cancel from the record alone. The reviewer reports where each hesitated, what it misread, and every command it ran that the output had not named.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. With real history the merge model is ordinary Git: the commit the bounty named, the solution's commits, current code. A clash is only where the solver and the owner changed the same lines since that commit.
- Git already has what both copies need (a linked working tree is one way). Prefer that to copying files by hand; say which you chose and why. Whatever it is, the tool creates it, records it, and removes it by exact path.
- The clean path must not get slower or noisier because the clash path exists.
- A copy of a large repository costs disk and time: the message says what was created and how big it is.
- Do not add a third way to look at a solution. Two views (as the solver made it, staged on current code) is the limit the owner agreed.
- Out of scope, each a later wave: standing rules and the content scan (BT8), the hook (BT9), the readable block (BT10), any reward above $0 (BT11). Combining parts of two solutions is the agent's own work and not a feature.
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
