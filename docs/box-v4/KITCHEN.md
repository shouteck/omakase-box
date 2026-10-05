# How the kitchen runs

The rules are in [AGENTS.md](../../AGENTS.md). This file is the procedure. The reasons behind it are in [LESSONS-W002.md](LESSONS-W002.md).

## Units of work

- A **milestone** (D2, D3, ...) is what the CEO approves. It has an outcome the CEO can observe.
- A **wave** is one task inside a milestone: one brief, one branch, one worker, one reviewer. The CTO opens and closes waves without asking.

## A wave, start to finish

1. **Brief.** Copy [the template](../../templates/wave.md) to `waves/<id>.md` and fill it in. One page. If it does not fit on one page the task is too big; split it.
2. **Branch.** `wave/<id>` from current master. Sequential work can use the main checkout. Parallel work gets its own worktree, one writer each.
3. **Implement.** The worker gets the wave file and nothing else by default. It commits to the branch and runs `node scripts/verify.mjs` itself before handing back.
4. **Review.** The reviewer checks out the worker's commit, reads `git diff master...wave/<id>` against the brief, runs `node scripts/verify.mjs` with the suites the brief names, and writes the verdict into the wave file: commit SHA, the verify summary line, PASS or FAIL, findings.
5. **Fix loop.** On FAIL the worker fixes and commits; the reviewer reruns on the new SHA. No new brief, no new approval. Rerunning a check is always allowed.
6. **Close.** On PASS the CTO merges with `--no-ff`, pushes master, removes every resource the wave created, replaces STATUS.md and deletes the branch.

When the last wave of a milestone closes, send the CEO the finished card with the next proposal.

## Verification

`node scripts/verify.mjs [suites...]` is the only acceptance command. It runs typecheck, boundary checks, build and the named suites on the host, gives them a disposable Postgres, and writes one log per step plus `summary.json` under `.kitchen/runs/`. The exit code is the verdict: zero only when every step passed.

- The candidate's identity is its commit SHA. Verify refuses to call a run with uncommitted changes acceptable.
- Name the suites the change affects in the brief. Do not run unrelated legacy suites on every wave.
- Tests named `*-live.test.ts` shell into the old container stack and are not part of ordinary verification until they are ported to the disposable database.
- A lost or unclear result is fixed by running it again. Databases are created per run and destroyed after it, so a rerun costs nothing.
- The reviewer's run is the one that counts. The worker's run is a self-check.

## Review

The reviewer answers three questions: does the diff do what the brief says and nothing else, does verify pass on this exact commit, and would the checks have caught a wrong implementation. It may add tests on the branch; it may not weaken existing ones.

**Lenses.** A generalist reviewer looks hardest where it is told to look. The brief therefore ticks the lenses that apply (security, user experience, measurement fairness) and the reviewer must answer each ticked one in the Result. An unanswered ticked lens means the verdict is not PASS. Tick only what applies; most waves need one or none.

**Second model family.** Tick it for the waves where a shared blind spot would be costly: source selection (D2.1) and the comparison (D4). It is best effort. If the other host is unavailable or out of usage, proceed with a separate agent of the same family, record that in the Result, and do not wait. It never blocks a wave.

## Recipients

From D2.2 on, some waves need a `box-recipient`: an agent given only an exported Box folder, with no access to the owner repository, standing in for an outside contributor. It is a third role, separate from worker and reviewer. Its report of what was missing or unclear is evidence for the wave, not a defect in the recipient. The CTO gives it the folder path and nothing else, and places the folder outside the repository checkout. An agent run this way is not an independent human and is never reported as one.

## When work stalls

- Two attempts at the same blocker with no new information: stop. The CTO diagnoses and either simplifies the task, changes the approach or escalates with one recommendation.
- A wave running at three times its size guess gets the same treatment.
- Separate environment failures from product defects in the report. If the environment is the problem, fix the environment as its own small wave before continuing the product task.
- Never stack unknowns. A wave that changes product code does not also introduce a new runtime, a new verification route or a new agent host.

## Resources

Anything a wave creates outside Git (containers, databases, temp directories, background processes) is named `kitchen-<wave id>-...` and removed at close. After a wave closes, `docker ps -a` shows nothing of ours. Nothing synthetic is preserved "just in case"; Git and the verify logs are the record.

## Records

- `STATUS.md`: one screen, replaced at every wave close. Never appended to.
- `waves/<id>.md`: the brief, then the result. One file per wave.
- Git: history. `git log --first-parent master` is the list of accepted waves.
- `.kitchen/runs/`: verify logs, ignored by Git. Quote the summary line in the wave file.

There is no state file, approval file, lease file or evidence directory for new work.

## Decision cards

Opening a milestone:

> **D2 - proposed**
> **You will get:** up to three outcomes you can see.
> **We will check:** one sentence.
> **Scope:** what it touches, plus any spending, external action or deletion.
> **Recommendation:** approve D2. Reply **Approve** or describe a change.

Closing one:

> **D2 - completed / partial / blocked**
> **Delivered:** up to three actual outcomes.
> **Checks:** passed / incomplete / failed, with any material limit.
> **Saved:** merged and pushed, or the blocker.
> **Next: D3 - proposed.** Outcomes, check, scope.
> **Recommendation:** approve D3. Reply **Approve** or describe a change.

"Approve" covers the named milestone only. Silence is not approval.

## Hosts

Any host can be CTO, worker or reviewer; see [PSTACK.md](PSTACK.md). Record which host and model did which role in the wave file.
