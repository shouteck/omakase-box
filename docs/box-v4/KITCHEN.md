# How the kitchen runs

The rules are in [AGENTS.md](../../AGENTS.md). This file is the procedure. The reasons behind it are in [LESSONS-W002.md](LESSONS-W002.md).

## Units of work

- A **milestone** (D2, D3, ...) is what the CEO approves. It has an outcome the CEO can observe.
- A **wave** is one task inside a milestone: one brief, one branch, carried out by the CTO. The CTO opens and closes waves without asking, but only as many as the START message allows; then it stops.

## A wave, start to finish

1. **Brief.** Copy [the template](../../templates/wave.md) to `waves/<id>.md` and fill it in, naming the station it belongs to (see [the brigade](../../kitchen/README.md)) and the [owner decisions](DECISIONS.md) it relies on. One page; if it does not fit, the task is too big — split it. `node scripts/brief-check.mjs` checks its references before dispatch (START.md step 4).
2. **Branch.** `wave/<id>` from current master. The main checkout is the default; separate worktrees are only for genuinely parallel writers (one writer per branch).
3. **Plan, if long.** A wave that is long by clock or by concept (several dependent steps, a design unknown, more than one sitting of focused work) starts with `/plan`; the brief says `Horizon: long` where that is already known. The agreed plan goes in the wave file under `## Plan`, so a later session can resume from it. A host without `/plan` writes the same section first. An overnight run writes it without waiting.
4. **Implement.** The CTO builds on the branch, with the playbook and the station card, and commits.
5. **Verify and check.** The CTO pushes the committed candidate, reads its hosted run (Verification below), then answers "Checking the work" below in the wave file: commit SHA, run id, level, findings. A failure is fixed and rerun on the new SHA, with no new approval. If the scope has to change, edit the wave file first. A failure whose cause is a design choice with no precedent goes to a prototype wave.
6. **Close.** When the checks hold, the CTO merges with `--no-ff`, pushes master, removes every resource the wave created, replaces STATUS.md and deletes the merged branch with `git branch -d` (the owner gave standing approval on 6 October 2026). If your host still wants a confirmation for that, do not ask and do not hold the close: leave the branch; the next kickoff sweeps merged `wave/*` branches. It also records the wave's verify cost — `node scripts/kitchen-stats.mjs --wave=<id>`; its `line`, counts and provenance go in the Result. Local history only, missing on a fresh clone.
7. **Reflect.** Before the next wave, the CTO writes two lines in the Result: what went wrong or was repeated, and which script, template line, check or profile it becomes. Sort each lesson by reach. **Wave:** nothing more to do. **Station:** add it to the station card. **Kitchen:** add one line to `kitchen/INBOX.md`. "Nothing" is an acceptable answer; a lesson left as prose in a report is not.

When the last wave of a milestone closes, send the CEO the finished card with the next proposal. While a decision is with the CEO, keep doing everything that does not depend on it: briefs, read-only investigation, cleanup. Do not sit idle behind a gate.

Keep ceremony in proportion: a one-command check needs no page of brief.

**States.** A brief on master awaiting the owner's "go" is **awaiting approval**, not a wave in flight; only the owner starts it. A running wave may be **parked** (a `Park <id>` commit); a later session resumes it from the wave file. Parking is not acceptance: no merge.

## Verification

- **Acceptance is the hosted run** (K50). A push to `wave/<id>` or master runs `verify --full test:box-bounty test:kitchen`, the platform suite and the install test on Linux, Windows and macOS (`.github/workflows/verify.yml`). Acceptance is that run green on all three systems on the wave's exact commit SHA, read with `gh run list -R shouteck/omakase-box --branch wave/<id>` and quoted in the wave file with its run id. Red, cancelled or missing is not a pass. The Result's own push runs again; that run too is green before the merge (K57). If GitHub's machines are unavailable, a full local run is the fallback and the wave file says so.
- **Local runs are for the files just touched**, while fixing; a full local run is no longer required before a merge. `--fresh` is only for a stated doubt about a record. Read master's latest run at kickoff and before the next merge; if it is red, the next wave is the fix.

`node scripts/verify.mjs [suites...]` is the command both kinds of run use. It runs typecheck, build and the named suites on the host without a database, and writes one log per step plus `started.json` and `summary.json` under `.kitchen/runs/`. The exit code is the verdict: zero only when every step passed.

- The candidate's identity is its commit SHA. Verify refuses to run on a tree dirty at start (exit 3, `UNCOMMITTED`); a run that ends dirty keeps per-step verdicts but is never a PASS.
- A step is `reused` instead of re-run when a completed `summary.json` — the trust anchor — proves it: a clean PASS on this commit, a PASS on one of the nearest 20 ancestors over paths the step does not read, or either dirty only in paths it does not read. `--fresh` forces a real run.
- Each run records one cheap load snapshot. kitchen-stats flags a duration far over the median of earlier comparable runs (rules in the script) — advisory, never a cause or a verdict; a rerun does not erase a failed attempt.
- `check` runs typecheck. `test:kitchen` runs only the files whose `// reads:` header the diff reaches (all for an unmapped path; none is refused); `summary.json` names them. Local runs are selected; the hosted run is full: `node scripts/verify.mjs --full test:box-bounty test:kitchen`.
- All runs report `db=none`; removed database modes refuse before work.
- Name the suites the change affects in the brief.
- A brief that changes what a command does or prints names `test:kitchen` in Done when; verify adds it anyway.
- A lost or unclear result is fixed by running it again. Do not start a duplicate while a finite command is still running.

A wave that needs a real GitHub journey runs it in the sandbox `shouteck/box-bounty-sandbox` — the tool is allowed standing there; `kitchen/sandbox.md` has the rules. No live step touches the working repository or needs the owner as a test subject.

## Checking the work

There is no reviewer, so the CTO checks its own commit from the real artifact, not from memory of writing it, and answers three questions in the Result: does `git diff master...<SHA>` do what the brief says and nothing else, does verify pass on this exact commit, and would the checks have caught a wrong implementation? For the third, try the behaviour directly and ask of each new test whether it would still pass if the code under test returned nothing; a test that would is not a check. Break the guarantee once in a scratch copy and show the test fail.

The result carries its level, because "passed" means different things: `ui-verified` (a person-facing flow was exercised for real), `test-verified` (behavioural tests ran on the commit) or `typecheck-only`. Behavioural work needs better than `typecheck-only`.

**Lenses.** The brief ticks the lenses that apply (security, user experience, measurement fairness), and the CTO answers each ticked one in the Result: what was tried and what was found. An unanswered ticked lens means no merge. Tick only what applies; most waves need one or none. With no second reader, blind spots are covered mechanically: tests that must fail, hostile inputs, fresh-agent checks where a brief names them, and the hosted run on three systems.

**Models.** Record the host and model that carried out the wave in the Result. Never claim one that was not used.

## Recipients

From D2.2 on, some waves need a `box-recipient`: an agent given only an exported Box folder outside this checkout and no repository access, standing in for an outside contributor. Its report of what was missing is evidence, not a defect. The CTO gives it the folder path and nothing else. Such an agent is not an independent human and is never reported as one.

## When work stalls

- Two attempts at the same blocker with no new information: stop. Write down the one assumption both attempts shared and question it before a third fix. Then the CTO simplifies the task, changes the approach or escalates with one recommendation.
- A wave running at three times its size guess gets the same treatment.
- Separate environment failures from product defects in the report. If the environment is the problem, fix the environment as its own small wave before continuing the product task.
- Never stack unknowns. A wave that changes product code does not also introduce a new runtime, a new verification route or a new agent host.

## Design decisions with no precedent

When a wave has to choose a design nobody here has built before, do not argue it out in a brief. Run a prototype wave first: two or three small throwaway attempts at the same narrow task, each on its own branch or worktree, compared against the same checks. Keep the winner's idea, discard the code, then write the real brief. One at a time on this machine.

## Getting better

- **Empty the inbox at every kickoff.** Each line in `kitchen/INBOX.md` is adopted or dropped, with the reason in the commit message. The inbox holds ten lines at most.
- **Adopt in the strongest form that fits:** a check in a script (through a kitchen wave); else a line in the wave template or a role file; else a station card line. A new rule in AGENTS.md or this file is the last resort and must replace an old one: the two files together stay under 20 KB.
- **About one wave in six is for the kitchen itself.** Kitchen waves run only when the owner names them or from the night queue. Pick it from the numbers, not from opinion, and run it as an experiment with a before and an after (the hillclimb playbook). Improvement does not wait for a mistake: an idea from any agent's report can earn an inbox line.

## Resources

Anything a wave creates outside Git (containers, databases, temp directories, background processes) is named `kitchen-<wave id>-...` and removed at close. Scratch roots live outside the checkout; verify refuses a dirty tree. The owner has given standing approval (6 October 2026) to delete, at every wave close and with no test running, the items in the system temp folder named `box-d21-*`, `box-k6-*` and `kitchen-verify-pg*`, and to stop an embedded test database a killed verify leaves, with its own stop command: only this kitchen's tests create them. Do it without asking. After a wave closes, `docker ps -a` shows nothing of ours. Nothing synthetic is preserved "just in case"; Git and the verify logs are the record.

## Records

- `STATUS.md`: one screen, replaced at every wave close. Never appended to. Only what blocks work now; other leftovers go to `BACKLOG.md`.
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
> **See it yourself:** the exact commands or clicks, five minutes, to watch the milestone work.
> **Next: D3 - proposed.** Outcomes, check, scope.
> **Recommendation:** approve D3. Reply **Approve** or describe a change.

"Approve" covers the named milestone only. Silence is not approval.

## Hosts and structure

The roles and the stations are in [kitchen/README.md](../../kitchen/README.md). They are the same on every host. Host notes are in [PSTACK.md](PSTACK.md). Record the host and model in the wave file.
