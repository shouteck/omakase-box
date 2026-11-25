# How the kitchen runs

The rules are in [AGENTS.md](../../AGENTS.md). This file is the procedure. The reasons behind it are in [LESSONS-W002.md](LESSONS-W002.md).

## Units of work

- A **milestone** (D2, D3, ...) is what the CEO approves. It has an outcome the CEO can observe.
- A **wave** is one task inside a milestone: one brief, one branch, done by the bot or bots D3vin assigns. D3vin opens and closes only as many waves as the START message allows; then it stops.

## A wave, start to finish

1. **Brief.** Copy [the template](../../templates/wave.md) to `waves/<id>.md` and fill it in, naming its station (see [the brigade](../../kitchen/README.md)) and its [owner decisions](DECISIONS.md). One page; if it does not fit, split it. `node scripts/brief-check.mjs` checks its references before dispatch (START.md step 4).
2. **Branch.** `wave/<id>` from current master. The writer D3vin names works in its own Orca worktree, never the main checkout; parallel writers use separate worktrees, one writer per branch.
3. **Plan, if long.** A wave long by clock or concept (several dependent steps, a design unknown, more than one sitting) starts with `/plan`; the brief says `Horizon: long` where known. The agreed plan goes in the wave file under `## Plan`, so a later session can resume. A host without `/plan` writes the same section first. An overnight run writes it without waiting.
4. **Implement.** The bot builds on the branch, with the playbook and the station card, and commits.
5. **Verify and check.** The bot pushes the committed candidate, reads its hosted run (Verification below), then answers "Checking the work" below in the wave file: commit SHA, run id, level, findings. A failure is fixed and rerun on the new SHA with no new approval. If scope has to change, edit the wave file first. A failure whose cause is a design choice with no precedent goes to a prototype wave.
6. **Close.** When checks hold, the bot writes the Result and reports the green branch to D3vin. D3vin merges `--no-ff`, pushes master, replaces STATUS.md and deletes the merged branch with `git branch -d` (owner approval, 6 October 2026). If the host wants confirmation, do not ask or hold the close: leave the branch; the next kickoff sweeps merged `wave/*` branches. The close removes the wave's resources and records verify cost (`node scripts/kitchen-stats.mjs --wave=<id>`: `line`, counts, provenance) in the Result. Local history only, missing on a fresh clone.
7. **Reflect.** Before the next wave, the bot writes two lines in the Result: what went wrong or repeated, and which script, template line, check or profile it becomes. Sort by reach. **Wave:** nothing more. **Station:** add it to the station card. **Kitchen:** add one line to `kitchen/INBOX.md`. "Nothing" is acceptable; a lesson left as prose in a report is not.

When a milestone's last wave closes, D3vin sends the CEO the finished card with the next proposal. While a decision is with the CEO, work continues on what does not depend on it: briefs, read-only investigation, cleanup. Do not sit idle behind a gate.

Keep ceremony in proportion: a one-command check needs no page of brief.

**States.** A brief on master awaiting the owner's "go" is **awaiting approval**, not a wave in flight; only the owner starts it. A running wave may be **parked** (a `Park <id>` commit); a later session resumes it from the wave file. Parking is not acceptance: no merge.

## Verification

- `lint` checks only the board's three type-aware promise rules; verify reuses it when no linted file, config or lint toolchain input changed, and the hosted run also runs it after install.
- **Acceptance is the hosted run** (K50). A push to `wave/<id>` or master runs `verify --full test:box-bounty test:kitchen`, the platform suite and the install test on Linux, Windows and macOS (`.github/workflows/verify.yml`). Acceptance is that run green on all three systems on the wave's exact commit, quoted in the wave file by run id; red, cancelled or missing is not a pass. A push touching only files the kitchen suite reads runs kitchen and audit, others `skipped` (K76): it passes with those and the nearest ancestor's full run green, as the Result's push must before merging (K57). If GitHub's machines are unavailable, a full local run is the fallback and the wave file says so.
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

There is no reviewer, so the bot checks its own commit from the real artifact, not memory, and answers three questions in the Result: does `git diff master...<SHA>` do what the brief says and nothing else, does verify pass on this exact commit, and would the checks have caught a wrong implementation? For the third, try the behaviour and ask whether each new test would still pass if the code under test returned nothing; a test that would is not a check. Break the guarantee once in a scratch copy and show the test fail.

The result carries its level, because "passed" means different things: `ui-verified` (a person-facing flow was exercised for real), `test-verified` (behavioural tests ran on the commit) or `typecheck-only`. Behavioural work needs better than `typecheck-only`.

**Lenses.** The brief ticks the lenses that apply (security, user experience, measurement fairness), and the bot answers each ticked one in the Result: what was tried and what was found. An unanswered ticked lens means no merge. Tick only what applies; most waves need one or none. With no second reader, blind spots are mechanical: tests that must fail, hostile inputs, scripted checks of what an agent sees, and the hosted run on three systems.

**Models.** Record the host and model that carried out the wave in the Result. Never claim one that was not used.

## Recipients

From D2.2 on, some waves need a `box-recipient`: an agent given only an exported Box folder outside this checkout, with no repository access, standing in for an outside contributor. Its report of what was missing is evidence, not a defect. The bot gives it the folder path and nothing else. It is never reported as an independent human.

## When work stalls

- Two attempts at the same blocker with no new information: stop. Write down the one assumption both attempts shared and question it before a third fix. Then the bot simplifies, changes approach or escalates to D3vin with one recommendation.
- A wave running at three times its size guess gets the same treatment.
- Separate environment failures from product defects in the report. If the environment is the problem, fix the environment as its own small wave before continuing the product task.
- Never stack unknowns. A wave that changes product code does not also introduce a new runtime, a new verification route or a new agent host.

## Design decisions with no precedent

When a wave has to choose a design nobody here has built before, do not argue it out in a brief. Run a prototype wave first: two or three small throwaway attempts at the same narrow task, each on its own branch or worktree, compared against the same checks. Keep the winner's idea, discard the code, then write the real brief. One at a time on this machine.

## Getting better

- **Empty the inbox at every kickoff.** Each line in `kitchen/INBOX.md` is adopted or dropped, with the reason in the commit message. The inbox holds ten lines at most.
- **Adopt in the strongest form that fits:** a check in a script (through a kitchen wave); else a line in the wave template or a role file; else a station card line. A new rule in AGENTS.md or this file is the last resort and must replace an old one: the two files together stay under 20 KB.
- **About one wave in six is for the kitchen itself.** Kitchen waves run only when the owner names them or from the night queue. Pick from the numbers, not opinion, and run it as an experiment with a before and after (the hillclimb playbook). Improvement does not wait for a mistake: an idea from any agent's report can earn an inbox line.

## Resources

Anything a wave creates outside Git (containers, databases, temp directories, background processes) is named `kitchen-<wave id>-...` and removed at close. Scratch roots live outside the checkout; verify refuses a dirty tree. The owner gave standing approval (6 October 2026) to delete, at every wave close with no test running, temp items named `box-d21-*`, `box-k6-*` and `kitchen-verify-pg*`, and to stop a leftover embedded test database with its own stop command: only this kitchen's tests create them. Do it without asking. After close, `docker ps -a` shows nothing of ours. Nothing synthetic is preserved "just in case"; Git and the verify logs are the record.

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
