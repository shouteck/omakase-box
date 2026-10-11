# BT6a: a bounty is an issue on the code that is already there

Milestone: BT · Station: packaging (also evidence) · Base: master at the time this cooks, after BT6's second run is merged · Branch: `wave/BT6a` · Timebox: 240 minutes; at expiry, report partial findings and stop

**Brief, written ahead.** By the CTO on 11 October 2026, while BT6's second run was cooking. The outcome is settled with the owner. Command names, state names and file paths follow the design discussion; the head chef checks them against BT6's Result before dispatching, corrects names only, and says in the pre-cook card what changed.

## Why

The owner's question, 11 October 2026: "the real tool working should just create an issue though why do you say pushes whole repository to a branch?"

Posting a bounty today builds a complete, cleaned copy of the working folder, with no history, and pushes all of it to a branch: on this repository, about 3,900 files and 30 MB for every bounty. That design comes from the product's earlier shape, where the solver never saw the owner's repository and it might be private. The tool now serves public repositories only. The code is already on GitHub and the solver can already see it. The copy gives them nothing, takes minutes, makes solutions look like changes to a branch with no past, and publishes whatever happens to be lying in the working folder.

## Outcome

On GitHub, a bounty is an issue that names the exact commit to work from, and an ordinary Git branch for solutions to target.

- When the agent has nothing local that the task needs, the branch is just a name pointing at a commit GitHub already has. Nothing is uploaded.
- When it has (commits not yet pushed, or changes not yet committed), the branch is that commit plus the agent's work on top, as ordinary commits. Only that is uploaded.
- A solver does what every contributor does: forks, works with the real history, opens a pull request against the bounty branch.
- Bringing a solution home is an ordinary Git merge of that pull request.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `PLAN.md` ("What is settled", "The three hard stops"); `waves/BT6.md` Result (the GitHub adapter as built, the listing, recovery of half-done outside steps, what "nothing is run" was proved against); `waves/BT3.md` and `waves/BT3a.md` Results (what the merge boundary protects in the owner's working tree); `kitchen/stations/packaging.md`.
- Do not touch: the never-ship table (it is applied differently here, not changed); the protections of the owner's working tree, index and branch that BT3's rounds closed; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.
- **Left as it is in this wave:** posting to a local folder and answering from a folder, which still use the snapshot. Whether to retire that path is a later decision; say in the Result what keeping it costs.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**What is published, and only that**

- `post --to github` works out the newest commit on the current branch that the GitHub repository already has. That is the starting point solvers are told to work from.
- **Nothing local is needed:** the bounty branch `box-bounty/<id>` is created pointing at that commit. A test shows no file content is uploaded.
- **Commits not yet pushed:** they go on the bounty branch as they are. The preview and the record state how many commits are being published for the first time, with their identifiers.
- **Changes to tracked files not yet committed:** the agent says whether the task needs them; that is part of saying what the task is. If it does, they become one commit on top, made by the tool, named for the bounty, built without touching the working tree, the index or the current branch. If it does not, they stay home. The tool states which was chosen; it has no default that publishes uncommitted work silently.
- **Untracked files are never published** unless the agent names each one. A name that is on the never-ship list is refused.
- **Never-ship still holds, on what is new:** a change being published for the first time that touches a never-ship path is a named refusal that publishes nothing. A never-ship-named file that is already in the public history cannot be taken back by this tool; the preview says so as a fact if one exists.
- The preview and the record list exactly what becomes public that was not public before: commits, files changed, files added. With nothing new, they say "nothing new is published".
- BT8's content scan, when it arrives, runs on that same list and nothing else.

**The listing**

- The issue says: the task, what was tried, the commit to work from, the branch to send pull requests to, whether the branch carries the poster's work in progress on top of that commit and how many commits, how to answer (fork, branch from the bounty branch, pull request against it), the reward ($0), the licence as a fact. It no longer says anything about a snapshot or files kept out.

**Solutions**

- A solution is a pull request against the bounty branch, from a fork or from a branch in the same repository. The tool fetches it without touching the working tree, the index or the current branch, as BT6 built.
- A pull request that changes or adds a never-ship path is refused, as today. One whose history does not descend from the bounty branch is refused by name: there is nothing sound to compare it with.
- The report is computed with Git from the real history: who and when, files changed, added and deleted with line counts, whether it merges cleanly onto the current branch and which paths clash if not (found without touching the working tree or the index), the flags, and the sentence that nothing was run.
- `apply <id> <n>` is an ordinary merge of that pull request's commits onto the current branch, as one merge naming the bounty and the solution. Everything that protects the owner's uncommitted work during a merge stays exactly as it is. `undo` reverses that merge as today.
- Closing removes the bounty branch. If the branch carried the poster's work in progress, closing says so before removing it and names the commits, so nothing the agent published is lost by surprise; the local work was never touched.

**What must not regress**

- Everything BT6 proved still holds on the final commit: the public-only refusal with no override; the limits gate and the confirmed stage; no credential touched; half-done posts and decisions recover and never duplicate; `status` reads the outside state with the time it was read; a stranger's text is never shown as the tool's; nothing from a solution is executed on fetch, report, merge or undo (the sentinel tests are re-run on the new path, plus a fork with a hostile history: an enormous one, one with a submodule, one with filters and hooks configured).
- Records of bounties posted the old way still load, and `status` says they were posted as a snapshot. A bounty still open from before this wave can be collected and closed.
- GitHub stays optional: the folder path is unchanged and its tests pass untouched.

**Cases that must fail, each a named refusal that changes nothing:** the current branch has no commit that GitHub has (nothing to point solvers at); the task needs uncommitted changes and they touch a never-ship path; an untracked file named for inclusion that is on the never-ship list or does not exist; a pull request against the wrong branch; a pull request unrelated to the bounty branch's history; the bounty branch was changed outside the tool since posting.

**Measured**

- Time and bytes uploaded to post one bounty on this repository, before and after, three runs each with the spread, for the two common cases: nothing local, and a small uncommitted change. The first run's figure for comparison was about 3,900 files and 30 MB.

**One real use**

- One real bounty on `shouteck/omakase-box`, posted this way from the main checkout with the merged tool. The task is a small real one from STATUS or the backlog, chosen so that it needs a small uncommitted change included, which exercises the harder case. **The owner sees the exact issue text, and the exact list of what becomes public, and says "go" before anything is posted.**
- A blind solver, in an empty folder outside every checkout and given only the issue's address, clones the repository, branches from the bounty branch and opens a pull request, using the account signed in on this machine. Say so in the Result: no fork and no stranger were involved; a fork is proven by tests only.
- A different session collects from the record alone, reads the report, looks at the solution, applies it, undoes it, applies it again, and closes.
- Anything left on GitHub is listed in the Result by exact name.

## Review lenses

- [x] **Security:** the reviewer attacks what becomes public and what comes back. Outward: get an untracked file, a never-ship path, or an uncommitted change the agent did not choose onto the bounty branch; get more commits published than the preview said; make the preview and the push disagree by changing the working tree between them. Inward: a fork whose pull request rewrites never-ship paths deep in its history but not in its final change; a pull request whose history is unrelated; anything that would execute from a solution during fetch, report, merge or undo. It re-runs BT6's attacks on the new path.
- [x] **User experience:** two readers, each fresh. A stranger with only the issue says what commit to start from, what branch to target, and whether the poster's unfinished work is included, then does it with ordinary Git and reports anything unusual about the experience. An agent with only the tool's output posts a bounty that needs a small local change, and says before posting exactly what will become public that was not.
- [x] **Measurement fairness:** the before and after figures. The reviewer checks both were taken on the same repository state and network, counts the uploaded bytes independently, and confirms the "nothing local" case uploads no file content at all.

## Notes for the worker

- Refactoring playbook for what is replaced, feature playbook for what is new. Go deep first: write down, for the GitHub path, every place the snapshot is assumed (the listing, the pushed tree, extracting a solution's change, the merge, the record) and what each becomes with real history. Much of it becomes plain Git and smaller.
- The owner's working tree, index and branch are never touched by posting or by looking. Build commits with Git's plumbing, not by checking anything out.
- "The newest commit GitHub already has" must be found from what the remote reports, not assumed from a local tracking name that may be stale.
- Publishing is the one thing here that cannot be undone. When in doubt between publishing and refusing, refuse and say why.
- Do not delete the folder path in this wave, and do not make the two paths share more than they do now. If keeping both is clearly costly, say so in the Result with specifics; retiring it is the owner's call.
- Out of scope: BT7's look and clash handling (it will be re-briefed against this wave and gets simpler); standing rules (BT8); the hook (BT9); the readable block (BT10); any reward above $0 (BT11).
- Nothing in this wave is posted overnight.
- Everything the wave creates in the temp folder or on the remote is named for the wave or the bounty and removed at close.

---

## Result

- Worker: Devin worker session on this Windows host (agent runtime; exact model identifier unavailable, no model diversity claimed). · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Before and after (time, bytes, files): fixture `tests/box/bounty/measure-post.mjs`, run on this repository's real state at `8bb29ab` against a local bare remote standing in for github.com; bytes are the thin pack `send-pack` builds (objects on the new tip minus what the remote's refs already reach), time is the measured push alone, three runs each.
  - Before — one parentless commit of the whole shipped snapshot against an empty repository, as the old adapter posted: **619–669 ms (median 623); 6,465,140–6,465,278 bytes on the wire; 3,906 files, 29,835,309 blob bytes shipped.**
  - After — nothing local needed, branch named for the commit the remote already has: **177–224 ms (median 213); 32 bytes — an empty thin pack, zero file content.**
  - After — one small uncommitted change the task needs (one tool-built commit on top): **196–224 ms (median 214); 299 bytes.**
- Real use: not done — the real post on `shouteck/omakase-box` needs the owner to see the exact issue text and say "go"; the head chef runs it after merge, same shape as BT6's Part C.
- What keeping the folder path costs: the snapshot machinery stays whole — `snapshot.ts`, the manifest and the folder answer path serve `post --to <dir>` exactly as before — and `github.ts` now carries two dispatch branches (history vs snapshot-posted records) plus the `shippedCommit` helper, which can only retire when no snapshot-posted record is still open anywhere. The two paths share create, the never-ship table and the merge boundary; the marginal cost of the folder path is the adapter itself plus the legacy branches, not shared code.
- Left on GitHub, by exact name: nothing — no run in this wave reached GitHub; every GitHub-facing test used the stand-in `gh` and local bare remotes.
- Fresh-reader runs (head chef, before the pass, on `bb67b06` fixtures under `%TEMP%\bt6a-ux`): two fresh Devin agents, each blind.
  - **Stranger (issue-only):** given only the generated issue text and a bare repo standing in for the remote. Correctly stated the base commit `33a8f0d`, the target branch, and that the poster's WIP sits on top (2 commits); cloned, branched from `origin/box-bounty/bt-de55640b92a8`, did the task, pushed `solution/add-usage-section` — all ordinary git. *Flag:* "Work from commit X" vs "branch from `box-bounty/<id>`" can read as conflicting — a literal read drops the poster's WIP; resolved correctly via "How to answer". Also noted the note names `TASK.md`/`app.js` as changed while `TASK.md` itself stays home.
  - **Agent poster (tool-output-only):** given a mid-state repo (uncommitted tracked change needed by the task + an untracked file not needed) and the CLI. Used `--with-changes` correctly; the preview stated exactly what becomes public (1 WIP commit `746d32e4`, `app.js` bytes) and what stays home ("Untracked: 3 entries stay home"). *Flag:* the composed note names untracked files (`scratch-notes.txt`) in the issue body — bytes stay home but **filenames are published** without the agent naming them; under the snapshot model names shipped anyway, this is new exposure. Also noted `create`'s snapshot preview describes a different (wider) deliverable than the GitHub preview — potential confusion; and `confirm --preview` leaves a dangling WIP commit (unreferenced, harmless).
- Findings and limits:
  - *Limit:* the measurement's before-figure approximates the shipped set by index pathspecs (`add -A` minus the never-ship table); the real manifest also folds owner `.boxignore` patterns, so a repository with `.boxignore` would ship less than measured. Blob and pack bytes are exact for the set measured.
  - *Limit:* push times are local-transport times; a real GitHub post adds network latency to both sides equally.
  - *Limit:* the enormous-history collection test uses a practical history length against the local fixture; no real-world fork was exercised.
- Merged: not yet — the pass reviews, then the head chef merges and runs the real post. · Resources removed: the measure fixture removes its own `box-bt6a-measure-*` temp dirs; the worker's `.verify-bt6a.log` was removed before commit.
- Reflect:
