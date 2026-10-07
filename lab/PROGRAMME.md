# Research programme

Set by the CTO from the product roadmap on 6 October 2026. There are no deadlines here: the order below is a logical sequence, and a line takes as long as honest work on it takes. The CTO decides which problems the lab works on, in what order, and which product decision each must inform. The lab lead decides how: the formulation, the method, the instruments, and when the evidence says a line should close. The owner is not asked to steer research.

## What the product is trying to prove

From `PLAN.md` on master, in order of risk:

1. A sliced package builds and passes its checks without the rest of the repository. **Shown** for TypeScript on a fixture; **shown in a prototype** (A0) for npm, Python and multi-package projects with no outside dependencies. **Accepted product capability through A4:** explicit extension-neutral selection, paired base/Box observations and declared-command-only export/verify, with R1/R2 replay records. A4 delivered actual folder-only npm/Python agent submissions accepted owner-side against pristine manifests and selected workspace execution with cached real picocolors@1.1.1, scripts disabled and excluded member source absent. Purpose-written fixtures prove capability, not useful real-issue delegation, controlled effort savings or enforced recipient isolation.
2. A recipient who has never seen the repository can finish the change from the package. **Shown** once on a fixture and once on a real internal request (R1).
3. It costs the owner less effort than ordinary delegation, or discloses far less source for similar effort. **Not shown.** Disclosure looks strong (R1 shipped 2 of 694 files); effort points the wrong way (R1 needed about 470 lines of checks for an 8-line change).
4. Someone chooses it again and would pay. **No evidence.** This is the owner's to pursue, not the lab's.

The lab exists to close the gap in claim 3 and to tell the product how far claims 1 and 2 stretch. Anything that does not serve one of those waits.

The aim behind all of it, from the owner: the person who posed the problem accepts the solution. The product gives them the most certainty it honestly can and guides them to the best solution available: proof where proof is possible, a stated degree of certainty where it is not.

## Standing direction

From the CTO, 6 October 2026: the product steers by the "useful" milestone in `PLAN.md` on master. A real issue from someone else's repository, a Box prepared in minutes with no code written for it, solved by someone who has never seen the repository, accepted by the owner-side check. The kitchen gets there through R2 and then R3. **Updated 6 October 2026, after R3:** the kitchen now gets there through milestone A (a repository-agnostic core, A0 to A4) and then R3b, a replay of fixed issues. Until those are done the lab works on Line 1, with one exception: Line 3 may open at its survey stage now. **Sync after A3:** A2/A3 have delivered language-free selection and neutral orchestration; Line 3's permitted survey has not happened and is no longer pre-A2 advice. It should study residual completeness/disclosure limits, without claiming the literature was reviewed for the accepted implementation. Line 2 stays closed. Within Line 1, favour whatever makes a check cheap to state for a request nobody has seen before. **Updated 7 October 2026, after R3b and the paired-check fix:** milestone A and R3b are done; the kitchen's order from here is A6, R3c, P1, R4 (see "Where we are and what comes next" in `PLAN.md` on master). The lab's recommendations from its 7 October sync are adopted. In order: (1) labelling guide version 1 with the added column "does the request text determine what the check asserts", counted on the predeclared outside sample; R3c will hide the acceptance test in some cases, so anything on detecting a request and check that disagree goes in the brief as soon as it exists. (2) Line 3's survey, which also carries the reading on what "the same failure" means between the repository and the slice; P1 will choose a file rule, so say what the field knows about a rule being sufficient. (3) "The same failure" as an experiment stays on Line 1 as U4, experiment 03. No line opens, closes or changes stage. The lab does not wait for the kitchen and the kitchen does not wait for the lab.

## Active lines, in priority order

### Line 1. From a request to a check

**Stage (kept by the lab lead):** survey and formulation done 6 October 2026; instrument in progress: labelling guide version 1 and outside sample 1 done 7 October 2026 (session 5); candidate-set harness not built. Files in `lab/lines/request-to-check/`; cross-line survey in `lab/survey.md`.

**The problem for the product.** Delegation is only worth it if saying what "done" means costs much less than doing the work. R1 showed it currently costs far more. The kitchen's R2 tries the engineering answer: let an agreement name tests that already exist. That covers changes to behaviour that is already tested. It does not cover the common case, where the request is for something new and no test exists yet.

**What the lab must find out.**

- What do real requests ask for, and how could each kind be checked: by an existing test, a new test, an example, a property, a judge, or only by the requester? Build this map from real requests (public issue trackers and this repository's own wave files are free), with counts. It tells the product what share of real work each kind of check would unlock.
- For requests with no existing test, what is the cheapest reliable way to get a check the owner trusts: the requester's own examples, tests generated from the request and confirmed by the requester, the recipient writing tests the owner reviews, or something the literature already recommends?
- How much does each route cost the requester, and how often does the resulting check accept a wrong solution or reject a right one?
- How well does each route hold up against a solver who is trying to pass without doing the work: special-casing the inputs a visible check uses, rewording instead of fixing, weakening or bypassing a check it can reach, or satisfying the letter of the request and not its intent? Honest mistakes and deliberate gaming are different threats, and once outside solvers are paid for accepted work the second one matters. Compare defences as well as routes: checks the solver never sees, checks the solver cannot change, more than one independent solution compared, and what the requester is shown to help them spot it.

**The bar.** Not automatic acceptance. The requester makes the final call; a check succeeds if it gives them evidence that makes that call easier and better, and says what it does and does not cover. A route that cannot decide an expectation by machine is still useful if it shows the requester exactly what to look at. Score routes on that as well as on wrong work accepted, right work rejected and requester cost.

**Decision it informs.** What the kitchen builds after R2, and what the MVP can honestly promise to verify.

**Sequence.** First. Whatever the survey shows that bears on R2 goes to the CTO before the kitchen writes the R2 brief, if the kitchen has not reached it yet; R2 does not wait for the lab. The map of real requests comes before any work on new ways of getting a check, because it decides which ways are worth studying.

### Line 2. Does a Box help?

**The problem for the product.** The roadmap's D4 is meant to compare a Box with ordinary delegation, and the kitchen has no sound way to run it. The claim that a small verified package helps an agent is the product's second wedge and has never been tested.

**What the lab must find out.** Same agent, same task, same checks: the Box against the whole repository. Success, steps, tokens where they can be counted, and what the agent got wrong. The repository's own history is a ready source of tasks: each merged wave has a starting commit, a brief, and a verify run that decides success. Build that into a reusable benchmark first.

**Decision it informs.** Whether to lead with "less context" as an advantage, and what D4 should measure. The CTO will hold D4 until this line has a benchmark, and may run D4 on it.

**Constraint.** Zero cost limits the number of runs. Report the count, treat small differences as noise, and say what a larger study would need.

**Sequence.** After Line 1 has its survey and its map under way. The benchmark comes before any comparison. The kitchen's D4 follows this line's benchmark, not the other way round.

### Line 3. Does the slice contain what the change needs?

**The problem for the product.** A2 now ships only the owner's explicit `files` selection; TypeScript import traversal is an optional proposal helper, not export authority. A2 compares recipient checks on the full base and isolated Box; A3 makes declared setup/checks sufficient without implicit install/compile. The remaining question is how often an owner-declared slice misses unexercised runtime/configuration/assets or reaches another copy, and what extra disclosure would address that. Matching decoded-text observations are not causal or completeness proof; no broad frequency has been measured.

**What the lab must find out.** Against real past changes (this repository's merged waves, then open-source projects), how often would the selection have contained everything the change touched and needed? What is missed: configuration, assets, generated code, things loaded at run time, tests? What does each fix cost in extra source disclosed?

**A constraint from the owner, 6 October 2026: the product should work on any repository.** Following TypeScript imports is tied to one language. When this line opens, weigh selection methods that do not depend on the language at all: an owner-declared file list checked by running the checks in a clean folder, and recording which files the checks actually open when they run. Language-aware analysis then becomes an optional refinement that makes a Box leaner, not a requirement for making one. Say what the literature knows about each.

**Decision it informs.** How far the supported kinds of change can widen, and what a Box must declare by hand instead of discovering.

**Sequence.** After Line 1's map, which will show which kinds of change matter most. It can share Line 2's benchmark of past changes, so build that once. Open it sooner if a session has nothing else that can run.

## Parked, with what would unpark them

These are real problems. They are not what stands between the product and its next decision, and working on them now would be research for its own sake.

- **A leaner stand-in that is checkably equivalent to the original.** This is step 4 of the slicing ladder in `PLAN.md` on master, so it is on the product roadmap, not abandoned. A stronger form of Line 3: hand over a much smaller version of the code with a machine verdict that it behaves the same where it matters. Unpark when Line 3 shows that shipping real files discloses too much or misses too much. Until then the survey for Line 3 should note what the field says is achievable.
- **Judging outcomes no test can check** (a design, wording, how something feels). Unpark when Line 1's map shows what share of real requests need it. If it is small, the product marks those as "the requester decides" and moves on.
- **Calibrated certainty and ranking of candidate solutions.** Unpark when the product has real accept and reject decisions to calibrate against, which needs users. Until then Line 1 records, for each kind of check, how often it is wrong; that is the raw material.

## First session

Done 6 October 2026; see `lab/survey.md`. The instruction as given:

Survey Line 1 properly: what the problem is called in the literature, who has worked on it, what is known to work and not to work, with sources. Skim Lines 2 and 3 only far enough to learn their names in the field and whether either is already answered. Write `lab/survey.md`, open `lab/lines/request-to-check/`, and put anything that bears on R2 in the brief straight away.

If the survey shows a line is aimed at the wrong problem, or that the order is wrong, say so in the brief with the reason. The CTO will change this page; do not work around it.

## Closed lines

None yet.

## Instruments the lab owns

- **Labelling guide, version 0** (`lab/lines/request-to-check/map/GUIDE.md`): sorts a requirement by the kind of check that could decide it. Known faults listed in `map/pilot/RESULT.md`; version 1 not written.
- **Pilot set** (`map/pilot/`): 79 "done when" clauses from this repository's own wave briefs, two labellers, agreement 78.5%. Tests the guide; it is not the map.
- **Outside sample** (`map/outside-sample/`): 5 open issues from one public project, as recorded by the kitchen in R3, one labeller. A first look only.
- **Candidate sets** (`experiments/01-r1-cheap-check/`, `experiments/02-existing-test-in-a-box/`): hand-made right and wrong solutions for one request, used to score a check. The runners in experiment 02 depend on the agreement format A1 removed and will not run as they are.
- **Not built:** a candidate-set harness for the neutral format. After accepted A3, drive the product's `export`/`verify` with declarations and consume A2 paired records; A0's loop is historical design input, not a lab execution fork.
- **Labelling guide, version 1** (`lab/lines/request-to-check/map/GUIDE.md`): five columns, including whether a request's text determined what its fix's tests assert. Followed almost identically by two same-family labellers; nine known faults, listed in `map/sample-1/RESULT.md`.
- **Outside sample 1** (`map/sample-1/`): 40 issues from four public repositories (5 open, 5 fixed each, by a rule committed before reading), 78 conditions, two labellers, a sceptic's re-derivation, and three known commander.js cases kept apart. Issue text, comments and test diffs are kept. Small and from hand-picked repositories; counts, not rates.
- **Sync state, 7 October 2026:** research session 5 run on master through `f47414f` (fix-paired-check). Brief replaced at the end of that session.

- **Labelling guide for the map, version 0, with pilot.** `lab/lines/request-to-check/map/`. 79 bullets from 15 wave briefs, two blind labellers, kappa 0.71. Measures whether the guide can be followed, not yet what real requests need. Faults known; version 1 specified, untested.
- **Existing tests as Box guards (historical).** `lab/lines/request-to-check/experiments/02-existing-test-in-a-box/`. Two old-format runners used to export a named test and run it in a clean folder. Seven hand-picked tests were tried; these runners have not been migrated to the accepted neutral format or rerun in this sync.
- **R1 candidate set.** `lab/lines/request-to-check/experiments/01-r1-cheap-check/`. 13 wrong and 4 right versions of one script, with a runner that scores any check on them. One request, no held-out part.
