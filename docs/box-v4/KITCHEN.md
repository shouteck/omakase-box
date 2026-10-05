# How the kitchen runs

The rules are in [AGENTS.md](../../AGENTS.md). This file is the procedure. The reasons behind it are in [LESSONS-W002.md](LESSONS-W002.md).

## Units of work

- A **milestone** (D2, D3, ...) is what the CEO approves. It has an outcome the CEO can observe.
- A **wave** is one task inside a milestone: one brief, one branch, one worker, one reviewer. The CTO opens and closes waves without asking.

## A wave, start to finish

1. **Brief.** Copy [the template](../../templates/wave.md) to `waves/<id>.md` and fill it in, naming the station it belongs to (see [the brigade](../../kitchen/README.md)). One page. If it does not fit on one page the task is too big; split it.
2. **Branch.** `wave/<id>` from current master. Sequential work can use the main checkout. Parallel work gets its own worktree, one writer each.
3. **Implement.** The worker gets its role file, the wave file and the station card, and nothing else by default. It commits to the branch and runs `node scripts/verify.mjs` itself before handing back.
4. **Review.** The reviewer checks out the worker's commit, reads `git diff master...wave/<id>` against the brief, runs `node scripts/verify.mjs` with the suites the brief names, and writes the verdict into the wave file: commit SHA, the verify summary line, PASS or FAIL, findings.
5. **Fix loop.** On FAIL the worker fixes and commits; the reviewer reruns on the new SHA. No new approval. Rerunning a check is always allowed. If the CTO changes the scope mid-wave, the wave file is edited first and the worker is pointed at it. After a second correction, stop resuming the same worker: start a fresh one with the wave file brought up to date, because instructions decay across resumes.
6. **Close.** On PASS the CTO merges with `--no-ff`, pushes master, removes every resource the wave created, replaces STATUS.md and deletes the branch.
7. **Reflect.** Before the next wave, the CTO writes two lines in the Result: what went wrong or was repeated, and which script, template line, check or profile it becomes. Sort each lesson by reach. **Wave:** nothing more to do. **Station:** add it to the station card. **Kitchen:** add one line to `kitchen/INBOX.md`. Cooks and the pass only report; sorting is the head chef's job. "Nothing" is an acceptable answer; a lesson left as prose in a report is not.

When the last wave of a milestone closes, send the CEO the finished card with the next proposal. While a decision is with the CEO, keep doing everything that does not depend on it: briefs for the proposed milestone, read-only investigation, cleanup waves. Do not sit idle behind a gate.

Keep the ceremony in proportion. A wave whose whole check is one cheap command does not need a page of brief; a wave that touches product behaviour does need a reviewer who is not the author.

## Verification

`node scripts/verify.mjs [suites...]` is the only acceptance command. It runs typecheck, boundary checks, build and the named suites on the host, gives them a disposable Postgres, and writes one log per step plus `summary.json` under `.kitchen/runs/`. The exit code is the verdict: zero only when every step passed.

- The candidate's identity is its commit SHA. Verify refuses to call a run with uncommitted changes acceptable.
- Name the suites the change affects in the brief. Do not run unrelated legacy suites on every wave.
- Tests named `*-live.test.ts` shell into the old container stack and are not part of ordinary verification until they are ported to the disposable database.
- A lost or unclear result is fixed by running it again. Databases are created per run and destroyed after it, so a rerun costs nothing.
- The reviewer's run is the one that counts. The worker's run is a self-check.

## Review

The reviewer answers three questions: does the diff do what the brief says and nothing else, does verify pass on this exact commit, and would the checks have caught a wrong implementation. For the third, ask of each new test whether it would still pass if the code under test returned nothing; a test that would is not a check. It may add tests on the branch; it may not weaken existing ones.

The verdict carries its level, because "passed" means different things: `ui-verified` (a person-facing flow was exercised for real), `test-verified` (behavioural tests ran on the commit) or `typecheck-only`. Behavioural work needs better than `typecheck-only`.

**Lenses.** A generalist reviewer looks hardest where it is told to look. The brief therefore ticks the lenses that apply (security, user experience, measurement fairness) and the reviewer must answer each ticked one in the Result. An unanswered ticked lens means the verdict is not PASS. Tick only what applies; most waves need one or none.

**Same model on both sides is normal here.** The pass is a fresh agent with no share in the cook's reasoning; that is the independence the kitchen relies on. What covers a shared blind spot is mechanical: attacks the pass runs, tests that must fail, and the off-machine run on every push.

## Recipients

From D2.2 on, some waves need a `box-recipient`: an agent given only an exported Box folder, with no access to the owner repository, standing in for an outside contributor. It is a third role, separate from worker and reviewer. Its report of what was missing or unclear is evidence for the wave, not a defect in the recipient. The CTO gives it the folder path and nothing else, and places the folder outside the repository checkout. An agent run this way is not an independent human and is never reported as one.

## When work stalls

- Two attempts at the same blocker with no new information: stop. Write down the one assumption both attempts shared and question that before trying a third fix. Then the CTO simplifies the task, changes the approach or escalates with one recommendation.
- A wave running at three times its size guess gets the same treatment.
- Separate environment failures from product defects in the report. If the environment is the problem, fix the environment as its own small wave before continuing the product task.
- Never stack unknowns. A wave that changes product code does not also introduce a new runtime, a new verification route or a new agent host.

## Design decisions with no precedent

When a wave has to choose a design nobody here has built before, do not argue it out in a brief. Run a prototype wave first: two or three small throwaway attempts at the same narrow task, each on its own branch or worktree, compared against the same checks. Keep the winner's idea, discard the code, then write the real brief. One at a time on this machine. The first use is D2.1, how a Box selects its source.

## Getting better

- **Empty the inbox at every kickoff.** Each line in `kitchen/INBOX.md` is adopted or dropped, with the reason in the commit message. The inbox holds ten lines at most.
- **Adopt in the strongest form that fits:** a check in a script (through a kitchen wave); else a line in the wave template or a role file; else a station card line. A new rule in AGENTS.md or this file is the last resort and must replace an old one: the two files together stay under 20 KB.
- **One wave in six is for the kitchen itself, and no more.** Kitchen waves never queue ahead of an approved product wave. Pick it from the numbers, not from opinion, and run it as an experiment with a before and an after (the hillclimb playbook). Improvement does not wait for a mistake: an idea from any agent's report can earn an inbox line.

## Resources

Anything a wave creates outside Git (containers, databases, temp directories, background processes) is named `kitchen-<wave id>-...` and removed at close. After a wave closes, `docker ps -a` shows nothing of ours. Nothing synthetic is preserved "just in case"; Git and the verify logs are the record.

## Records

- `STATUS.md`: one screen, replaced at every wave close. Never appended to. Only what blocks work now; other leftovers go to `BACKLOG.md`.
- `waves/<id>.md`: the brief, then the result. One file per wave.
- Git: history. `git log --first-parent master` is the list of accepted waves.
- `.kitchen/runs/`: verify logs, ignored by Git. Quote the summary line in the wave file.

There is no state file, approval file, lease file or evidence directory for new work.

## Overnight runs

The owner says `START.md overnight` and goes to sleep. The head chef runs waves back to back and reports once, in the morning. This is pstack's autonomous run: state the exit condition, drive to it, checkpoint as you go, never relax the condition to declare victory. Read `.devin/plugins/box-pstack/skills/poteto-mode/playbooks/autonomous-run.md` and `pause-safely.md` first.

**Before the first wave**, write `waves/night-<date>.md` with:

- the exit condition as something checkable ("D1.2 merged to master", "K2 and K3 merged");
- the scope: milestones already approved in STATUS.md, plus any the owner named in the overnight message. Naming a milestone there is its approval. Nothing else is in scope;
- the limits the owner gave (a stop time, a number of waves). If none, stop when the exit condition is met or nothing in scope is left;
- the queue: the "Night queue" in STATUS.md, cut down to what is in scope. Keep that queue stocked in the day so a night never runs dry: when a wave closes, the head chef adds the next product waves and any kitchen cleanup that is ready.

**During the night:**

- Every wave runs exactly as in the day: brief, cook, the pass, merge on PASS. Nothing reaches master without the pass. A night run never skips review, weakens a test or lowers a verdict level to keep moving.
- Never stop to ask. When a question comes up that only the owner can answer, park it in the night file with the options and the default you would choose, then move to the next wave in the queue that does not depend on it. Kitchen cleanup waves are there for exactly this.
- A wave that stalls (two attempts with nothing new, or three times its timebox) is parked: leave its branch as it is, write down what was tried and what you would try next, move on. Two parked waves in a row means something shared is wrong: stop the run.
- After every wave, merged or parked: replace STATUS.md, push master, add a line to the night file. If the session dies, at most the wave in flight is lost.
- One heavy job at a time, and five minutes between full verify runs.

**Not at night, whatever the reason:**

- anything on the owner-only list in AGENTS.md: spending, new remote destinations, external messages, deleting anything not disposable;
- starting a milestone the owner did not approve or name, or anything past the end of the night queue;
- starting D4 or any wave whose result is a recommendation to the owner;
- changing the rules: AGENTS.md, this file, role files and `scripts/verify.mjs` are read-only overnight. Note the change you want in the night file instead;
- adding or upgrading a dependency, or downloading anything;
- force-pushing, rewriting history, or pushing an unreviewed branch.

**Stop when** the exit condition is met, the owner's limit is reached, nothing in scope is left, two waves in a row were parked, or the host reports that usage is running out. On any stop, pause safely: no half-written files, every branch committed, every resource the run created removed, STATUS.md current.

**The morning card** goes at the top of the night file and is what the owner sees first:

> **Overnight - met / partly met / stopped early**
> **Merged:** up to three outcomes, with their verdict levels.
> **Parked:** each wave left on a branch, and why, in a line.
> **Waiting for you:** each parked question with the default taken, or "nothing".
> **Next:** what a bare START.md will do now.

Under 200 words. Counts come from Git and the wave files, not from memory. The owner keeping the machine awake overnight is the owner's setting; the kitchen does not change it.

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

The brigade, the stations and the rule for when a station gets its own chef are in [kitchen/README.md](../../kitchen/README.md). They are the same on every host. Host notes are in [PSTACK.md](PSTACK.md). Record which host and model filled each role in the wave file.
