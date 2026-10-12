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

**A program the tool needs is missing**

- With Git absent, too old for what the tool uses, or the GitHub command line absent or not signed in, every `bounty` command that needs it refuses by name, changes nothing, and prints the full commands that install it and sign in on that machine (Windows, macOS, Linux each get their own; the tool prints only the ones for the machine it is on). It runs none of them. The tests control executable lookup rather than relying on what the host has installed.

**Cases that must fail, each a named refusal that changes nothing**

- `apply` for a solution that does not exist; `apply` on a clash; any command with Git missing; a solution's commit present only on another branch (nothing closes); a record whose branch no longer exists (stated, nothing closes).

**Everything else**

- No new command. No side copy, no staged state, no `finish`, no `cancel`, and nothing built on `undo`.
- Every output names the next command. No step is interactive. Nothing is asked of the agent in words.

## Review lenses

- [x] **Security:** the reviewer tries to make the tool close a bounty that was not merged (a commit with the same message, the same tree, a cherry-pick, a merge on another branch, a rewritten branch, a record edited to name another branch or commit), to make it close the wrong one of two, and to make a comment or solution text steer the closing. It checks that the refusal for a missing program cannot be made to print a command taken from anything a stranger wrote.
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

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
