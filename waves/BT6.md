# BT6: the first bounty posted outside, as a GitHub issue

Milestone: BT · Station: packaging (also evidence) · Base: master at the commit that adds this file · Branch: `wave/BT6` · Timebox: 180 minutes; at expiry, report partial findings and stop

## Outcome

A confirmed bounty can be published where strangers can see it: `box bounty post <id> --to github` opens an issue on the project's own GitHub repository and pushes exactly what was shipped to a branch beside it. An answer comes back as a pull request against that branch, and the tool treats it as it treats any answer: checked, reported as facts, decided by the agent or the owner. The decision closes the issue.

No money moves in this wave. A GitHub issue was chosen (owner, 11 October 2026) because it is also what the paid sites build on: Algora turns an issue into a paid bounty with one comment, TaskBounty funds an issue. The reading behind the choice: ArcAgent releases money automatically on its own checks (against our rule that the agent or owner decides), TaskBounty showed no way for a program to post, Pinchwork is shut down.

**This repository is public as of 11 October 2026.** What this wave posts is readable by anyone.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`; `.box/limits.json` and the tool-kept block in `AGENTS.md` only as the tool itself writes them.
- Read for context: `PLAN.md`; `waves/BT2.md` (post, the record), `waves/BT3.md` and `waves/BT3a.md` Results (the return path and its boundary), `waves/BT5.md` Result (the journey as run); `kitchen/stations/packaging.md`, `kitchen/stations/evidence.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding and the merge boundary, except to call them. `export`, `submit`, `verify`, `trace`. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit, and the suites reach no network: they run against a stand-in `gh` and a local bare repository as the remote. They pass on the off-machine runner too.
- **Posting.** `post <id> --to github` on a confirmed bounty:
  - pushes one commit with no parent, whose tree is exactly the shipped set, to the branch `box-bounty/<id>` on the repository's GitHub remote. A test shows the pushed tree equals the shipped set file for file, and that nothing else is pushed;
  - opens one issue whose body is the listing a stranger can act on: the task, the note on what was tried, the check and its level, what is not included, the branch to work from, and how to answer (a pull request against that branch). It says there is no reward;
  - writes the issue's address, its number and the branch into the record. `status` and the open-bounties line show them.
- **The tool never touches a credential.** It calls the `gh` and `git` already signed in on the machine. It does not read, ask for, store or print a token. Tests assert no token-shaped value reaches output or the record.
- **Public repositories only, and the tool says so.** Owner's decision, 11 October 2026: posting outside is not offered for private repositories. The issue and the branch go to the project's own GitHub repository and nowhere else. Before anything is pushed the tool reads that repository's visibility. If it is private, or the visibility cannot be read, the post is a named refusal that changes nothing and says why in one sentence: posting outside would publish the code, so the tool does this only for repositories that are already public, and a local folder is still available. There is no setting that overrides it. `describe`, `help` and the doc page state the same thing up front, so an agent on a private repository learns it before it prepares a bounty, not at the last step. The preview for a public repository says that anyone can read the issue and the branch.
- **Gated twice, as the product rules require.** The owner's limits must name `github` as an allowed destination; without that the post is a named refusal that changes nothing. The bounty must be confirmed, as today. The preview shown at `confirm` for this destination states the repository, whether it is public, the exact issue title and body, and the branch name.
- **Half-done posts recover.** If the branch is pushed and the issue fails (or the reverse), the outcome is a named state that says what exists outside and the command that finishes or removes it. Posting twice does not create a second issue or branch.
- **Answers.** `answer <id>` with a GitHub-posted bounty lists the pull requests open against its branch as facts (number, author, files changed). `answer <id> --pr <n>` fetches that pull request without touching the working tree, the index or the current branch, and hands it to the existing answer path: never-ship refusal, change extraction, the facts report, attempts.
- **A stranger's code is not run.** The check executes whatever the answer contains. When the pull request's author is not the account signed in on this machine, the tool fetches it, reports everything it can without executing anything (the change, the flags, the dry merge), records the attempt in a named state that says the check was not run and why, and names the next step. There is no flag in this wave that runs it on the host; a contained run is a later wave. The doc page says this plainly.
- **Decisions reach the issue.** `apply`, `reject` and `withdraw` each leave one comment stating the fact (applied, with the commit; rejected, with the recorded reason; withdrawn), close the issue and remove the remote branch. `undo` adds a comment and records it. If the outside step fails after the local one succeeded, the local result stands and the record says what is still to do outside.
- **GitHub stays optional.** Everything that worked before this wave works on a machine with no `gh` and a repository with no GitHub remote: create, the record, confirm, post to a local folder, answer from a folder, the report, apply, undo. A test runs that journey with `gh` absent. The GitHub-specific code sits in one place that the rest does not depend on, so a second destination later is an addition and not a rewrite; do not build a general plug-in system for it now.
- **Cases that must fail, each a named refusal that changes nothing:** `github` not in the limits; a private repository; a visibility that cannot be read; bounty not confirmed; `gh` missing or not signed in; the remote is not GitHub; a pull request that targets another branch; a pull request that adds a never-ship path; `--pr` naming a pull request that does not exist.
- **The owner's facts stay honest.** `describe` and the cost and wait lines say what is now true: posting to GitHub costs nothing, is public, and nobody is known to be watching for these issues yet.
- **One real use, once, on `shouteck/omakase-box`** (see "The real post" below). The Result records the issue address, the pull request address, the report the collector read and the decision.
- Works on this Windows host from Git Bash and PowerShell.

## The real post

Naming BT6 in the START message is the owner's approval for exactly this, and nothing more: one public issue, one branch `box-bounty/<id>` and one pull request on `shouteck/omakase-box`, with comments from the tool's own decision commands. No other repository, no bounty site, no money, no message to anyone.

1. The head chef picks one small real task from STATUS ("Findings for later") that has a mechanical check which fails today.
2. **Before posting, the head chef shows the owner the issue title and body exactly as they will appear, and waits for "go".** Only then is `github` added to `.box/limits.json` and the bounty posted.
3. A blind solver, started in an empty folder outside every checkout and given only the issue's address, clones the bounty branch alone, does the work and opens the pull request. It uses the account signed in on this machine, so the check runs. Say so in the Result: no stranger answered, and the stranger path is proven by tests only.
4. A different session collects from the record alone, reads the report and decides.
5. Close: the issue is closed and the remote branch removed by the tool's own commands. Anything left outside is listed in the Result by exact name.

If the owner does not say "go" at step 2, the wave closes with the adapter built and tested, the real post not done, and says so.

## Review lenses

- [x] **Security:** the reviewer attacks what crosses the boundary in both directions. Outward: tries to get a private repository posted by any route (a stand-in `gh` that errors or returns nonsense about visibility, a remote that points somewhere other than the repository whose visibility was read, a setting in the limits that claims to allow it), and tries to get a never-ship file, an untracked file or history onto the pushed branch, and a token into output or the record. Inward: a pull request that adds a never-ship path, one whose branch name or title carries shell characters, one from another author whose code would run if the tool ran the check (it must not), and a stand-in `gh` that returns hostile text. It re-runs BT3's attacks through `--pr`.
- [x] **User experience:** two readers. A fresh agent given only the doc page posts a prepared bounty and says what will become public before it does. A fresh agent given only the issue body, as a stranger would be, says what the task is, where the code is, how to answer and what it is not being paid.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. The adapter is a thin layer: `post` already gates and records, `answer` already checks and reports. Add the destination and the way in from a pull request; do not rebuild either.
- Build the pushed commit without touching the working tree or the index (`commit-tree` on a tree made from the shipped set is one way). The packaging card's notes on saving and restoring bytes apply.
- Every argument that came from outside (branch names, titles, authors) is passed to `git` and `gh` as an argument, never through a shell string.
- Issue text is a listing, held to the product rule: facts, no verdicts, no promises about reward or timing.
- Why public only: a whole-repository bounty in a public place publishes all of the code. Serving private repositories properly means sending only the files a task needs, which is not built and not planned. One clear refusal is better than a half-working private mode.
- Out of scope, each a later wave: any bounty site, any reward or payment and the rule for a window before payment is final; running an outside author's answer in a container; posting to a repository other than the project's own; private repositories; a smaller set of files.
- Nothing in this wave happens overnight.
- Everything the wave creates in the temp folder or on the remote is named for the wave or the bounty and removed at close.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Real post:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
