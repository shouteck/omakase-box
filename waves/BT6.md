# BT6: the first bounty posted outside, with no checks

Milestone: BT · Station: packaging (also evidence) · Base: the reviewed first-run candidate `59d92d4` on `wave/BT6`, with master merged in to pick up this brief · Branch: `wave/BT6` · Timebox: 240 minutes; at expiry, report partial findings and stop

This is the second run of BT6. The first run built and reviewed the GitHub adapter and stopped before posting anything (see "First run" at the end). Between the runs the owner changed the product (11 October 2026, all in `PLAN.md`): **checks are removed.** The tool helps an agent post a problem and bring solutions back; choosing among them is entirely the agent's or the owner's. This run takes the checks out, lets a solution from any account be chosen and merged, and then makes the one real post.

## Outcome

1. A bounty is the task, the note on what was tried, the one line of why, and the code. Nobody is asked for a command, and **nothing a solver wrote is ever run by the tool.**
2. A solution from any GitHub account can be listed, looked at, and merged onto current code, with a report that describes the change and nothing more.
3. One real bounty is posted publicly on `shouteck/omakase-box`, answered and collected.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`; `.box/limits.json` and the tool-kept block in `AGENTS.md` only as the tool itself writes them.
- Read for context: `PLAN.md` (read "What is settled" and "The three hard stops" first); this file's "First run"; `waves/BT3.md` and `waves/BT3a.md` Results (the return path, the report, the merge boundary); `kitchen/stations/packaging.md`, `kitchen/stations/evidence.md`.
- Do not touch: the never-ship table, the snapshot identifier, the manifest binding and the merge boundary, except to call them. `export`, `submit`, `verify`, `trace` and their packages: the earlier platform keeps its own checks. `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.

**Part A: checks removed**

- **Creating.** `create` needs the task and the one line of why; the note is optional and the tool still gathers what it can without running anything (the files changed so far). It does not ask for, accept or run a check, a guard or a setup command, and there is no level. Passing one of the old flags is a named refusal that says checks were removed and changes nothing.
- **The listing** a stranger reads has: the task, what was tried, where the code is, how many files were kept out, how to answer, and that there is no reward. No check section, no level. The title is not repeated as a second heading (the first run's preview did). It states, as a fact and without a promise, whether the repository has a licence file and its name.
- **An answer from anyone.** `answer` fetches a solution whoever wrote it. The never-ship refusal and the unsafe-path refusal stay exactly as they are. The rule that an outside author's answer cannot be applied is removed, because nothing is run.
- **The report describes the change and only that:** who sent it and when; files changed, added and deleted, with line counts; whether it would merge cleanly onto the current branch and which paths clash if not, found without touching the working tree or the index; flags as plain observations (adds files, deletes files, large against a stated size, touches a file marked as a test by a stated rule); and always one sentence saying that nothing in the solution was run and the report says nothing about whether it works. The banned-words test from BT3a still holds.
- **Choosing and merging.** Every solution is a numbered attempt. `apply <id> <n>` merges that one as today; `undo`, `reject` and `withdraw` work as today. A clash still stops cleanly and names the paths; resolving it is the next wave.
- **States.** The states that only existed for checks are gone. Every outcome is still a named state with a next command. Records written before this wave still load; say in the doc page how an old record that carries a check reads.
- **Nothing is executed, proven by attack.** Fetching, reporting and merging a hostile solution runs nothing from it: no hook, filter, merge driver, submodule fetch or script it carries. A test plants a sentinel in each and shows none fired.
- **A stranger's words are not the tool's words.** `status`, the open-bounties line and every summary print only what the tool generated: counts, numbers, its own identifiers, times. An account name is shown only if it has the shape GitHub allows. Text a solver wrote (titles, descriptions, file contents) appears only when the agent asks to look at that solution, and is marked as the solver's.
- **The description, help and doc page are rewritten to match, and are not longer than before.** They say: what the tool does, that choosing is the agent's, that nothing is run, and that posting outside is for public repositories only.
- **Tests of removed behaviour are removed, not bent.** Each removed test is listed in the Result with the behaviour it covered. Tests that guard something still present (never-ship, the manifest binding, the merge boundary, undo, the adapter's refusals) stay and pass unchanged.

**Part B: the adapter, kept from the first run**

- Everything the first run built and the pass attacked still holds on the final commit: posting exactly the shipped set as one parentless commit; the public-only refusal with no override; the limits gate and the confirmed stage; no credential touched; recovery of half-done posts and decisions; `status` reading the outside state with the time it was read; GitHub staying optional. Re-run those tests; do not rebuild.
- Each bounty issue carries the fixed label `box-bounty`, created if the repository lacks it, so every bounty made by this tool can be found with one search.

**Part C: the real post**

- One real use, once, on `shouteck/omakase-box` (below). The Result records the issue address, the pull request address, the report the collector read and what it chose.
- Works on this Windows host from Git Bash and PowerShell.

## The real post

Naming BT6 in the START message is the owner's approval for exactly this and nothing more: one public issue, one branch `box-bounty/<id>`, one label and one pull request on `shouteck/omakase-box`, with comments from the tool's own commands. No other repository, no bounty site, no money, no message to anyone.

1. The first run's prepared draft (`bt-83106aba72a1`) and its trial folders (`kitchen-BT6-owner`, `kitchen-BT6-bounty`, `kitchen-BT6-preparation`) carry a check and are out of date. The kitchen made them; remove them by exact name and prepare again with the finished tool.
2. Same task as before: the cold-copy bootstrap gap in `docs/box-v4/BOUNTY.md`. This time supply a real note on what was tried.
3. **Before posting, show the owner the issue title and body exactly as they will appear, and wait for "go".** Only then is `github` added to `.box/limits.json` and the bounty posted.
4. A blind solver, started in an empty folder outside every checkout and given only the issue's address, clones the bounty branch alone, does the work and opens the pull request. It uses the account signed in on this machine; say so in the Result. No stranger has answered, and a stranger's path is proven by tests only.
5. A different session collects from the record alone: reads the report, looks at the solution, chooses, and applies it.
6. Close with the tool's own commands. Anything left outside is listed in the Result by exact name.

If the owner does not say "go" at step 3, the wave closes with Parts A and B merged if they pass, the real post not done, and says so.

## Review lenses

- [x] **Security:** three attacks. (1) Get something from a solution executed during fetch, report, apply or undo, by any route. (2) Get a solver's text shown as if the tool had written it, or an account name carrying instructions into `status`. (3) Re-run the first run's attacks on the final commit: a private repository posted, a never-ship file or history on the pushed branch, a token in output or the record, a never-ship path in a solution, a hostile stand-in `gh`.
- [x] **User experience:** three readers, each fresh. One reads only the doc page and says, before posting, what will become public and what the tool will and will not do with solutions. One reads only the issue body, as a stranger would, and says what the task is, where the code is, how to answer and what it is not being paid. One is given a repository with two solutions waiting, one of them from another account, and only the tool's own output; it chooses and merges one unaided and says what was unclear.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Refactoring playbook for Part A (taking a capability out without disturbing its neighbours), feature playbook for what is new. Delete the check path; do not leave it behind a switch. A tool with fewer parts is the point.
- The merge boundary took BT3 three rounds. Do not re-open it; the change is which answers reach it, not how it merges.
- Every argument that came from outside is passed to `git` and `gh` as an argument, never through a shell string.
- Issue text is a listing: facts, no verdicts, no promises about reward, timing or licence.
- Out of scope, each a later wave in `PLAN.md`: a place to try a solution and a way to resolve a clash (BT7); standing rules (BT8), so the per-bounty yes stays as it is in this wave; the hook (BT9); any reward, payment or bounty site (BT10).
- Nothing in this wave happens overnight.
- Everything the wave creates in the temp folder or on the remote is named for the wave or the bounty and removed at close.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Removed tests:
- Real post:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:

---

## First run (11 October 2026): adapter built and reviewed, nothing posted

Kept as the kitchen wrote it. The brief it worked to is in Git history (`59256cd`); it required a mechanical check and did not let an outside author's answer be applied, both of which the owner has since removed.

- Worker: Codex, inherited configured model, Windows, `/root/bt6_worker`. Reviewer: independent Codex pass, Windows/PowerShell, `/root/bt6_reviewer`; exact runtime model identifier unavailable, no model diversity claimed.
- Commit: `59d92d4ca9205502b6a1417e0720c300429d42cb`, parked on `wave/BT6`. Full diff includes `59256cd`, a concurrent session's brief commit that captured some in-progress product edits; history preserved and all code reviewed. Worker commits `02ffe2f` and `59d92d4` contain implementation and correction.
- Worker verify: `verify 59d92d4 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=embedded 1046s`, clean SHA; bounty 170/170, packaging 142 passed and 6 existing skips. Record `.kitchen/runs/2026-10-11T00-11-49-102Z-59d92d4`.
- Reviewer verify: completed exit 0, `verify 59d92d4 PASS check=reused@2026-10-11T00-11-49-102Z-59d92d4 build=reused@2026-10-11T00-11-49-102Z-59d92d4 test:box-bounty=reused@2026-10-11T00-11-49-102Z-59d92d4 test:box-package=reused@2026-10-11T00-11-49-102Z-59d92d4 db=embedded 9s`. Own record `.kitchen/runs/2026-10-11T00-30-18-056Z-59d92d4`; independently inspected clean exact-SHA records and suite logs, no doubt warranted fresh repetition.
- Verdict: adapter PASS, test-verified. Full wave and real-use outcome pending the owner's exact-listing “go”; not merged or declared complete.
- Security lens: independent offline CLI attacks passed public visibility fail-closed, mismatched push destination and private override refusal, byte-for-byte shipped tree with one parentless commit and no late untracked file/history, duplicate posting, PR target/no-op/never-ship/owner-list refusals, token/hostile text handling, foreign-author sentinel nonexecution and explicit-attempt apply refusal, status freshness and dated outage facts. Owner tree/index/HEAD/record stayed unchanged on applicable refusals. BT3-family manifest/ignored-file/existing-directory/dirty-undo/staged-undo attacks and apply/undo restoration passed under both autocrlf settings.
- First correction: reviewer found issue-create lost-response withdrawal, undo discarding pending apply cleanup, and unauthenticated comment marker recovery. Worker reconciles authenticated outside resources and all recorded decisions; direct reviewer CLI probes passed all three repairs. Regression also pins the publication commit and proves retry after Git garbage collection.
- User experience lens: fresh `/root/bt6_doc_reader` read only BOUNTY.md and successfully ran read-only GitHub confirmation preview against the prepared bounty. It correctly stated disclosure, public/limits/approval gates and confirm/post order. Fresh `/root/bt6_issue_reader` read only the exact generated preview and correctly stated task, branch, check, PR target and no reward. Actual doc-only posting, blind solver and independent collection are still pending approval. PowerShell direct CLI journeys and Git Bash help smoke passed; displayed check quoting may need shell adaptation.
- Real post prepared: local draft `bt-83106aba72a1`, title `[box bounty bt-83106aba72a1] Explain how to bootstrap a cold copy before using the bounty CLI`, target `shouteck/omakase-box`, planned branch `box-bounty/bt-83106aba72a1`. No issue, remote bounty branch or PR created; no github limits permission added. Exact generated stdout saved as UTF-8 in `C:/Users/shout/Desktop/Projects/kitchen-BT6-preparation/ISSUE-PREVIEW.md` and opened for owner review.
- Real task: recorded cold-copy bootstrap documentation gap; Node-only text check fails on shipped source, recorded exit 1 with command positions `[-1,-1,1592]`. Snapshot `c25409102997459491b22268dcd7c3217ec27ebc` and candidate have identical tree `5e1cc84a7ef487374f699b5b7f9a28b5b1e5b4a3`. Would ship 3891 files/29613796 bytes, 5 files removed by never-ship rules. The doc fix itself is untouched.
- Environment: preliminary `02ffe2f` acceptance failed only the pre-existing packaging ANSI fixture under inherited `NO_COLOR=1`; independent tiny child reproduction proved plain vs expected ANSI output. Final verify removed NO_COLOR only in a copied child environment, with no fixture/expectation/global setting change. Sandbox initdb required approved execution under owner account; database cleaned. Local clone required owner-account execution because upload-pack rejected sandbox ownership; no global Git trust setting changed.
- Method: feature playbook. Worker reports domain modeling shaped durable publication intent, boundary discipline constrained hostile responses, idempotence reconciled every pending decision, and behavior tests proved recovery. Reviewer read prove-it-works for tree/blob and direct CLI attacks, boundary-discipline for authenticated recovery, and TypeScript/type-system guidance for response parsing.
- Merged: not yet, pending real-use approval. Main checkout returned to master. Disposable verification databases and worker/reviewer attack scratch removed; no process running. Trial directories `kitchen-BT6-owner`, `kitchen-BT6-bounty` and `kitchen-BT6-preparation` under Projects are deliberately retained for this pending approval, to remove when the wave closes. Draft record is in the owner's trial clone only.
- Findings and limits: hosted repair run `38095432520` is green. BT6 has not been pushed as product code or observed on a hosted runner. Foreign answers remain nonexecuting and nonapplicable by design; no stranger evidence exists. Fresh reader flagged pre-existing full-snapshot restoration recipe and command display quoting, recorded in BACKLOG. Whole-repository local preparation took minutes; no performance change in this wave.
- Reflect: recovery treated the last local event as complete outside truth. Wave: authenticated resource reconciliation, all-decision replay, pinned-publication ref and negative recovery tests now encode the corrected model; no further rule needed. The inherited color-setting failure became a recorded process-local environment diagnosis, not a weakened assertion.
