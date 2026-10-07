# Notebook: from a request to a check

Append-only. Newest entry last.

## 6 October 2026, session 1: survey

**Set out to do.** The programme's first session: survey Line 1 properly, skim Lines 2 and 3 for their names in the field and whether either is already answered, and send the CTO anything that bears on R2.

**Before starting.** Merged `origin/master` into `lab` (STATUS.md, K6 brief, packaging card; no conflicts). Master has no "For the lab" section in BACKLOG.md yet, so there was nothing from the CTO to answer. Kitchen state: K6 parked, R2 not approved and not briefed, D4 unstarted.

**Did.** About 30 web searches and 35 page reads, all free. Read R1's wave file, notes and agreement as the product's one real data point. Wrote `lab/survey.md`, this line's `README.md` and `related-work.md`. Every source is tagged by how it was read: abstract read, or search summary only. No paper was read in full.

**What happened.**

- The problem has no single name. The useful frame came from the benchmark-critique literature, not the test-generation literature: a check is a classifier with a false-accept rate, a false-reject rate and a cost.
- Expected to find that existing tests are a sound check and the hard part is only the missing-test case. Found instead that developer-written tests are wrong in both directions at rates that matter. This changed the line's formulation: every route, including "name an existing test", has to be scored for error, not assumed safe.
- Expected a published breakdown of requests by how checkable they are. Did not find one. Benchmarks filter to requests that already have tests, which hides the case the product most needs.
- Requester-cost evidence is thin: one 15-person study at function scale.
- Line 2 is not answered in the field. The nearest studies suggest context changes move cost more than success, and that small studies cannot resolve success differences under 10 to 15 points.
- Line 3 is not answered for import-following selection. The field's known gap is run-time loading.

**Dead ends and failures.**

- OpenAI's two SWE-bench Verified pages returned 403 to the reader. Their figures are from search summaries only and are tagged so.
- The Aarhus call-graph paper downloaded as a PDF the host could not render (no PDF tool installed). Its recall figures are from a search summary only.
- A search summary attributed "7.87% of bug-fix pull requests improve tests" to no identifiable paper. Left out.
- Searches for a taxonomy of requests by verifiability returned taxonomies of review comments and task types instead.
- arXiv:2507.18130 is now titled Doc2Feat-Bench; search results still call it NoCode-bench and quote an older best score (28.07%) than the current abstract (37.72% on the verified subset). Used the abstract.

**Surprise followed.** R1's check. Its agreement lists two commands: `tsc --noEmit` and one generated evaluator test. The outcome is "a section stops appearing in the output; everything else is preserved". In the field's terms that is one small fail-to-pass condition plus a pass-to-pass guard. The existing kitchen suite (22 tests then) already is a guard. So the roughly 470 lines may have bought a custom guard the repository partly had. Not tested: the existing tests may not cover what R1's fixtures covered, and they did not ship in the Box. Recorded as the first open thread and passed to the CTO as a question, not a finding.

**Sceptic.** A fresh agent was dispatched on the survey's scholarship and framing. Its report is `sceptic-survey.md`; corrections made after it are listed in the next entry.

**Next.** Formulate: fix the definitions in the README, write the labelling guide for the map (kinds of check, plus whether the outcome is observable at a command line), and label this repository's own wave files as a pilot before sampling public trackers. Settle the R1 open thread from recorded evidence first; it is cheap.

## 6 October 2026, session 1, after the sceptic

**Sceptic's verdict** (`sceptic-survey.md`; same model family as the lab lead, so independent by being fresh, not by being different). No invented source, author or number. One wrong comparison and several numbers quoted without the qualifier beside them in the source, each making the draft read stronger than the evidence.

**Corrected in the survey, related work, README and brief:**

- "One in five accepted solutions is wrong" did not stand as a general statement. Estimates run from about 1% to 20% by method; the 19.71% comes from model-written tests that themselves wrongly rejected valid fixes on about a tenth of tasks.
- METR: "about half" was already adjusted for the 68% human baseline; the draft quoted both. Raw figure is a third to a half.
- SWT-Bench: precision doubled at 20% recall. The draft left the recall out.
- TiCoder: 3 small tasks; only the yes/no variant was significant; the large gain assumes a requester who is never wrong.
- "The literature suggests requester-confirmed generated checks are the cheapest trustworthy route" did not stand. It is now a hypothesis. The sceptic found older human studies (Staats et al. 2012; Fraser et al. 2015) that point the other way, which the first search missed entirely.
- Line 2: the draft's prior that the effect on success would be small came from studies that add context, not remove source. Withdrawn. What stands is the cost of measuring: tasks, not runs, are the limit.
- "No requester-cost evidence" was too strong: acceptance-test experiments from 2006 to 2009 exist and are unread.

**Lesson for the instrument stage.** The lab lead's errors all ran one way: toward the tidier story. The map's labelling guide should be written so a second labeller cannot see the first's labels, for the same reason.

**Added from the Git record after the first entry** (observation, not a rerun). `tests/kitchen/kitchen-stats.test.ts` existed at R1's base `e412e08`: 193 lines covering `readRuns`, `stallCheck`, `checkLimits`, exit codes and the printed page, with no mention of Usage, and unchanged by R1. R1 added about 400 lines of checks and check plumbing across five files (`git diff --stat e412e08 ddeb3ab`, excluding research and wave files). So most of R1's "preserve" clause had a guard already; the new part was one condition. Not checked: whether that existing test runs inside a Box, and whether it covers R1's fixtures.

**Still unverified:** Qi 2015 and Smith 2015 (cited from search summaries), the 90,000 pull-request figure, the agent-pull-request task shares, the 7.3% enhancement share, and the model-judge papers.

**Next, revised.** Before formulating: read Liang et al. (arXiv:2609.12012), Staats et al. 2012 and the Fit-table experiments. Then the labelling guide and the pilot on this repository's wave files.

## 6 October 2026, session 2: formulate

**Set out to do.** Read what the sceptic found, settle the R1 thread, fix the definitions, write the labelling guide and try it on our own wave briefs.

**Before starting.** Merged `origin/master`: K6 is accepted there, not parked as the last brief said. Master now has "For the lab" in BACKLOG.md; the CTO took the R2 and D4 advice and asked that the R1 claim be settled before it is quoted. Installed the repository's pinned tooling and dependencies inside the lab folder (free; `npm ci --prefix scripts/tooling`, then a frozen pnpm install) after `kitchen-busy` said idle.

**Reading.** Poor yield. Liang et al. (arXiv:2609.12012): abstract only; it separates test availability, test validity, feedback use and evaluation independence, which matches this line's frame. Ricca et al. 2009: summary only; acceptance tables helped students understand requirements without significant extra effort, which is about reading tests, not writing them. Staats et al. 2012, Melnik et al. 2006 and Barr et al. 2015: could confirm they exist, could not open them. The human-confirmation question stays open and unread.

**Experiment 01** (`experiments/01-r1-cheap-check/`). Plan committed before the run (`b899611`). Eight candidates, two checks. All 16 predictions came true; the lead's Result said the cheap check matched R1's custom check on 7 of 8 and that the custom test mostly restated the existing one.

**The sceptic broke the second half.** Ten more candidates: on its six wrong ones the checks agree once. Each check catches wrong work the other accepts, and each rejects one right candidate because it searches for a word. It also found an arithmetic slip (three of seven, not six), an unrecorded second pass, flattering case selection, and that the cost comparison was of judgements, not of R1's 827 added lines. Standing: table stands, "about as well" weakens to suggests, "restated" does not stand.

**What changed my mind.** I went in expecting to show R1's cost was avoidable. What the evidence supports is narrower and more useful: the existing test and the new test protect different things, the new test was the weaker of the two in places, and the avoidable-cost question turns on delivery into a Box, which nobody has tested.

**Second time the lead's draft ran ahead of the evidence in the same direction.** Both times the cause was the same: cases and readings chosen by the person holding the hypothesis. Made structural: the formulation now requires candidates written by an agent that has not seen the checks.

**Formulation.** Fixed in the README: request, clause, candidate, right and wrong, check (evidence of change plus guard), route; three measures; what would show it wrong.

**Map pilot** (`map/pilot/`). 79 bullets, two blind labellers, kappa 0.71 on kind of check, 0.74 on observable. The guide's faults: the bullet is the wrong unit, "record it" riders inflate READ, two kinds of condition have no label, one default was wrong. Version 1 specified in `map/pilot/RESULT.md`.

**Dead ends.** The older human studies could not be opened at zero cost through this host's reader. The call-graph PDF from session 1 is still unread for the same reason (no PDF tool).

**Next.** Instrument. Guide version 1: split bullets into atomic conditions, add the red-or-green-on-base column, re-test agreement on the same 79. Then the first sample from outside this repository. In parallel, when the kitchen is idle: try to run the existing kitchen-stats test inside an exported Box, which is the test of whether R1's cost was avoidable.

## 6 October 2026, session 3: the two leftovers from session 2

**Set out to do.** Read the papers that could not be opened (the owner approved the downloads), and test whether an existing test can travel into a Box as the guard.

**Before starting.** `origin/master` already merged; "For the lab" still answers the session 1 brief. Kitchen idle throughout by `kitchen-busy`.

**Reading.** The host already had a free PDF library (`pypdf`), so nothing was installed. Downloaded two PDFs into `lab/papers/` (kept out of Git): Staats et al. 2012 from the University of Luxembourg's repository after the KAIST link returned 404, and Barr et al. 2015 from UCL. Ricca et al. 2009 is paywalled; abstract only. Melnik et al. 2006 could not be obtained: the Calgary repository serves the file through a page these tools cannot read. Also read the abstract of the call-graph paper saved in session 1. Notes are in `related-work.md`.

- Staats et al., from the full text: 30 students wrongly approved 26.1% to 58.6% of incorrect generated invariants and wrongly rejected 9.1% to 31.7% of correct ones. The sceptic's summary-level figure was right. This counts against "the requester confirms a generated check" as a cheap safe route, with the caveat that the subjects did not own the code.
- Barr et al.: human oracle cost splits into writing the oracle and judging outcomes. Same split as this line's cost measure; adopted the vocabulary, changed nothing.

**Experiment 02** (`experiments/02-existing-test-in-a-box/`). Plan committed before the run (`dfb4f31`). First run died at setup: R1's recorded patch no longer reverses cleanly after K6. Fixed by restoring the lines by text. Every prediction then held: the agreement format refused an empty evaluator list; export named `vitest` as undeclared; with that declared the Box exported with three owner files; in a clean folder the existing test was green on the base and after the accepted change. Added after seeing that: two wrong candidates, both red.

**The sceptic's corrections.**

- The "evidence of change" check was a command with a comment. As declared it exits 0 on the base. The runner computed red, not the Box. Withdrawn. This is the third session in which the lead's draft claimed more than was run, and the first where the gap was in the experiment itself and not its wording.
- Six more tests through the same route: three arrive broken with no gap named, because they start or read files by path. So "an existing test can be the guard" is true of some tests, and the exporter cannot tell which.
- The format can be satisfied with another request's evaluator.

**What I believe now that I did not this morning.** R2's premise splits in two. The guard half is real and nearly free for tests that import what they test. The evidence-of-change half does not exist in the product in any form: no declared check is red on the base, nothing runs checks on the base, and the owner side never runs declared commands. R1 got its evidence of change from the custom evaluator, which is the expensive part.

**Dead ends.** KAIST's PDF link (404). Calgary's repository (script-only page). The first attempt to rebuild the base by patch.

**Next.** Unchanged from session 2: guide version 1 and the map. One addition for the instrument stage: turn experiment 02's runner into a small harness that takes any test and reports "travels / arrives broken", and run it over every test file in this repository, so the three-of-seven becomes a count over all of them instead of a hand-picked handful.

## 6 October 2026, session 4: catch-up and re-aim after the product went repository-agnostic

**Set out to do.** The lab last ran in the morning. Since then the kitchen finished R2, tried an outside repository (R3), decided the product must work on any repository, prototyped a neutral core (A0) and built a neutral agreement format (A1). This session: work out what the line's README and the lab's brief now say that is no longer true; label the issues R3 recorded as the lab's first outside requests; rewrite the README for a product whose core knows only files, commands, exit codes and patches; draft the next brief. Reading, analysis and writing only: nothing was installed, built or run, and nothing was fetched.

**Before starting.** `origin/master` already merged into `lab` by the lab lead (`a2ffb48`). Read: `BACKLOG.md` "For the lab", `STATUS.md`, `PLAN.md`, `waves/R2.md`, `R3.md`, `A0.md`, `A1.md`, `research/box-delegation/a0/RESULT.md` with both scripts, `r3/READINESS.md`, `r3/evidence/issue-candidates.md`, `r2/notes.md` and the verdict files under `r2/evidence/`, and from the product `packages/box-package/agreement.ts`, the base-check part of `export.ts`, and `docs/box-v4/delegation/SUBMISSION-CONTRACT.md`.

**Why the formulation changed** (the README said to record this). Session 2 defined a check as "evidence of change plus a guard" and left open what either looks like in a Box. The product has since fixed that: a check is a declared command with a role and a context, and its result is an exit code. Two kitchen results then showed the session 2 definition was too weak: "red on the base" is not enough (A0: red for a missing file looks the same), and "green on the base" is not enough either (experiment 02's hollow test; R3's note that zod's tests would load the published package inside a Box). The new statement adds both as conditions U4 and U5, adds "the solver cannot reach the check" as U8 from R2, and adds a seventh kind of wrong candidate. Terms kept: request, clause, candidate, right and wrong, route. "Evidence of change" is now called an outcome check, the product's word.

### Reconciliation: statement by statement

**Out of date or superseded.**

1. README: "Shows: nothing in today's Box makes a check red on the base. A recipient who changes nothing can pass every declared check." Brief: "The evidence-of-change half does not exist in the product." **Superseded by R2.** Commands carry a role; export runs every one on the untouched base in each context and records the result; a failing guard refuses the export; no failing outcome produces a warning (`export.ts` lines 160 to 217). The reviewer's own no-op submission was rejected with the compiler's diagnostic (`waves/R2.md`, Findings). What is left: the all-green case warns and does not refuse; a passing outcome check beside a failing one is not flagged (my reading of line 215, not run); owner verify does not re-check that an outcome was red at the base (`r2/notes.md`, Gaps).
2. README and brief: "The format also accepts an evaluator registered for a different request"; brief: "It demands at least one generator". **Superseded by R2 and A1 as a requirement, not closed as a possibility.** The evaluator list now defaults to empty and an agreement needs "at least one evaluator generator or command check" (`agreement.ts` lines 90 and 97 to 100). The legacy path still exists (`BACKLOG.md`: "Legacy generator checks still use the registry"), so by reading, an agreement that chooses it can still list another request's generator. Not rerun.
3. Brief: "Owner verify runs install, `tsc` and registered owner checks, never the agreement's commands." **Superseded by R2.** Verify runs the owner-context commands in a scratch clone. Recipient-context commands are not rerun owner-side, by design.
4. README: "the exporter reports success without naming a gap" for tests that arrive broken; open thread 1, "untested as a detector". **Superseded for declared checks.** A recipient-context guard that fails on the base in the staged Box refuses the export (`export.ts` lines 188 to 213; `r2/notes.md`: "A red recipient guard, e.g. a command naming a file the Box never shipped, refuses export"). The kitchen tested this on a generic fixture and met one real instance (item 9). The lab's three broken tests were not put through it; the brief's proposed acceptance test was not run by the kitchen as far as its records show.
5. README: "Not shown: that R1's preparation cost was avoidable end to end ... the evidence-of-change half and the owner side are not built." **Half superseded.** Both are built. R2 ran one request end to end with no code written for it. It still does not show R1's cost was avoidable: R2's request was chosen because a compiler flag already failed on it (`waves/R2.md`, "Candidate and first gate"), and R1's kind of request has no such command.
6. README open thread 2, "What does evidence of change look like as a declared check? ... It has to exit non-zero on the base." **Answered, and shown to be insufficient.** R2 gives one instance. A0 shows a non-zero exit is necessary and not sufficient.
7. Brief, "Next lab session": a harness "run over every test file in the repository". **Superseded.** It assumed the old format, import-following selection and vitest. A2 builds the general form (same check, full repository against Box). Also, by reading: experiment 02's runners build their agreement from R1's, which carries the `toolchain` field A1 removed, so they would now be refused at parse. Not run. The instrument list in `PROGRAMME.md` still lists them as usable.
8. Brief: "`tsc` in the Box says nothing about `.mjs` files" and "choose a request whose existing test imports what it tests". True of what was tested; now statements about the optional TypeScript helper, with no bearing on the neutral core.

**Confirmed by the kitchen's own results.**

9. "A step that reports success says nothing about whether the check can run" (the lab's export-names-no-gap finding). **A0 confirms the class with different tools:** a locked install exits 0 with a needed package missing, on npm and pnpm; only the guard showed it. **R2 met one real instance:** the R1 guard failed in the base clone because pinned tooling is installed, not committed (`r2/notes.md`, "CTO correction round"), and it was found by running the check. Limits: A0 is tiny fixtures with no outside dependencies, one Windows machine, one version of each tool; R2's instance is a missing untracked folder in the owner clone, related to but not the same as a file missed by import-following.
10. "Run every declared check on the base at export" as the cheap detector. **Adopted, and it worked once on a real case** (item 9).
11. "R1's purpose-written check accepts wrong work." Not rerun by the kitchen (`BACKLOG.md`: "noted, not rerun"). **R2 adds an independent instance of the same thing by a different mechanism:** agreed commands accepted a submission with gutted assertions, because the guard was the editable file. One constructed attack by the reviewer.
12. Open thread 5 (the recipient can see, and here can edit, the check). **R2 is the first observation.** One case, constructed by the reviewer, not chosen by a solver.
13. "In our own briefs an existing check alone decides about one clause in ten." Not tested by the kitchen. R3's 0 of 5 is **consistent with** existing checks rarely deciding, but it measures a narrower thing (an existing check that fails on the base) on five hand-chosen bug reports.

**How A0's two findings relate to the lab's.**

- *Install exits 0 with a package missing* is the same phenomenon as the lab's tests that arrive broken, one layer down: something before the check says "fine" and is wrong. Three separate success signals have now been seen not to predict whether a check runs: export, the compiler in the Box, the installer.
- *Red for the wrong reason* is the half the lab missed. The lab's rule in the brief was "a check counts as red only by its exit code". That rule was needed (experiment 02's check was a comment and exited 0). A0 shows it is not enough. And A0's own table shows the proposed remedy has a gap: the outcome check exits 1 in the valid slices (ii, iii, iv-b) and exits 1 in the six missing-package trials (i, iv-a, iv-c, on both managers). An exit-code comparison between the full repository and the Box would call those the same. All six were caught because the guard was red too, and in these fixtures guard and outcome load the same module. An outcome check that needs something no guard touches would pass as validly red. Not tested by anyone.
- The mirror image, *green for the wrong reason*, is in the lab's own record (the sceptic's finding 4 on experiment 02: one of ten tests passes in the Box because there is nothing there to measure) and in R3's readiness note (zod's tests import the package by name, so in a Box they would load the published copy; flagged by the cook, untested). A check on the base cannot see this either. What can: a candidate that destroys the editable must turn a guard red, which is what experiment 02's two post-hoc rows did by hand.

**What `issue-candidates.md` records, per candidate.** For #6637: an expected behaviour, a real probe (the nightly compiler printed nothing; no exit captured), and the statement that no existing file uses the expression. For #6639: a quoted one-expression reproduction and a one-line fix location; "no existing test asserts" rests on the suite being reported green. For #6641 and #6648: a one-line description and a rejection; no run and no search recorded. For #6621: a description and an unlogged search. Read times were retracted and no query transcript exists. None of the five defects was reproduced. So "no open issue had a ready failing check" is recorded as five rejections of unequal strength, in one repository, chosen by an unrecorded method.

### The outside sample

`map/outside-sample/`. Five clauses, one labeller, guide version 0, from the cook's summaries. `EXISTING` 0, `COMMAND` 0, `EXAMPLE` 2, `MEASURE` 0, `NEW-TEST` 2, `READ` 0, not labellable 1. Seen from outside the code: 5. Two of the four labels could move one step with the issue text. What it says about the map: the cheapest label was empty; the red-or-green-on-base column the pilot proposed is the one R3 turned on; the source of a check (repository, request text, written new, a person) is a separate column the guide lacks; one case shows an existing check likely asserting the behaviour to be changed. Four additions to guide version 1 are listed in its `RESULT.md`.

### R2's records read as a candidate set

From `research/box-delegation/r2/evidence/phase3/` and `review/`, verdicts by the product's owner-side verify. Right: the rename (accepted), remove-and-fix-the-caller (accepted). Wrong: no change (rejected by the outcome check), an assertion changed so the test fails (rejected by the guard), parameter removed with the call site left (rejected), empty file (rejected by the guard, "no test suite found"), assertions gutted (accepted). So 2 right, 0 rejected; 5 wrong, 1 accepted. Not held out: the cook and the reviewer wrote them with the checks in front of them. One thing the kitchen's summary does not say: `verify-wrongedit.json` shows the parameter-removed candidate was rejected by the product-owned `compile` step, before any declared command ran. A3 removes that step. Whether the declared `tsc` command would also have rejected it is likely and not recorded.

### Surprise followed

A0's table against PLAN's sentence "A2 runs each outcome check in the owner's full repository as well as in the Box and requires the same result in both". I expected the table to support it. It does not, if "result" means pass or fail or the exit code: 1 and 1. This became U4 in the README, experiment 03 in the open threads, and the first piece of advice on A2 in the brief draft.

### Dead ends and things not done

- Could not label #6648, and could label #6637 and #6641 only with a stated doubt, because the kitchen kept summaries and not issue text, and this session was told not to fetch.
- Did not rerun anything. Every statement above about current product behaviour is from kitchen records or from reading code, and says which.
- Did not check by running whether the legacy evaluator path still accepts another request's generator; reading `agreement.ts` and the backlog says it should.
- Did not survey mutation testing, which U5 leans on. It is named in `related-work.md` and nothing more.
- No sceptic has seen this session. The reconciliation is one reader's; the outside labels are one labeller's.

**Where my own draft ran ahead and was pulled back.** The first draft of the outside result said nearly all of the pilot's `EXISTING` labels were guards. I had not counted. Removed. My first reading of R3 was "open issues with a failing check are rare"; the record supports "five were rejected, on evidence of unequal strength", and the structural argument is reasoning.

**Next.**

1. Guide version 1 with the four added columns and rules, then an outside sample declared before it is read: a fixed rule for choosing issues, more than one repository and language, open and recently fixed, the issue text kept, two blind labellers. Light; needs free reading of public trackers.
2. The candidate-set harness as a lab copy of A0's loop, run on A0's four fixtures and on R2's recorded candidates. Heavy.
3. Experiment 03, plan first: which export-time proxy separates right-reason red from missing-file red, and whether an emptied editable exposes a guard that reads the wrong copy. Heavy.

## Sync only — 6 October 2026, after A2/A3

**Purpose.** `LAB.md sync`, not a research session: reconcile the lab with accepted kitchen master `d7ced3c53f3bbcc693020e25ac402357d3bb968b` before A4 resumes. Prior brief commit `c33dbb2a0a79fd288910b075f722dd76c582f599` was at `2026-10-06T17:55:33+08:00`. First-parent merges since it are A2 `f6b5a4c` and A3 `602d3fd`: two accepted waves.

**What was done.** Read the researcher role, LAB sync route, charter/programme/brief, AGENTS/STATUS and the close procedure. Fetched origin and merged origin/master into this lab worktree, without conflicts. Read current master BACKLOG's "For the lab", STATUS, A2/A3 accepted results, A4's pending brief and the submission contract. Updated only the lab's current README, programme and brief; earlier notebook entries and experiment records remain historical.

**Record corrections, from kitchen records, not new lab evidence.**

- A2 is accepted on product candidate `2f64a31`. `files` alone selects source; TypeScript traversal proposes only. Selected dependency bytes are unchanged. Recipient checks have paired base/Box result/exit, bounded tails and complete normalized decoded-text stdout/stderr digests, JSON-framed. The final independent pass records refusal of same-exit/different-output omissions, beyond-tail and embedded-NUL repartition attacks. This answers session 4's exit-only objection for distinguishable diagnostics. It does not establish failure causality, raw-byte identity, preservation, or readiness when no recipient check runs. Invalid UTF-8 differences can decode equally.
- A3 is accepted on `2dbea18`. Neutral export/verify no longer require generated Node files or product-owned install/compile; helper orchestration is explicit opt-in. The independent pass specifically removed `repo` from `r1Agreement` while leaving callers unchanged: `unused-param-outcome` rejected it by declaration. Session 4's uncertainty about this specific candidate is answered.
- Candidate accounting matters: the cook's six-row R2 replay calls a cosmetic unused-parameter edit "wrong edit"; it is not the removed-parameter case. The pass separately covers that case and an empty edit. Keep those mutations separate. Weakened editable assertions still pass; no broad false-acceptance rate or claim that all five historical wrong candidates were replayed identically.
- A4 remains pending, with folder-only npm/Python fixtures, immutable guards, exact negative kinds, alternative right solution where feasible, actual clocks/check authorship and a pinned script-disabled outside dependency. These are capability fixtures, not the useful real-issue milestone or an effort comparison. Existing A4 advice is adopted; additional export mutation and argument-name warning advice is deferred, not a gate.

**Reply and next.** Acknowledge A2/A3 delivery and the specific compile-removal attack; consume A2's paired records in a future harness driving accepted neutral export/verify, not a lab copy of A0. Retain issue text/screening tuples, all candidate verdicts and separate check-development/declaration clocks as requests to the kitchen. Next research remains guide version 1 and a declared outside sample; no priority/stage changes. A4 can proceed under its existing approval after this sync.

**Limits and method.** Nothing was installed, downloaded, tested, experimentally run or newly reviewed; no researcher/recipient/sceptic was dispatched. Prior small, hand-picked, non-held-out lab observations and literature qualifications are unchanged. Pstack `boundary-discipline` kept recorded observations separate from correctness claims; `guard-the-context-window` kept this sync to active records and a replaced brief, without opening unrelated history. Neither principle grants authority or changes a rule.

## Sync only — 7 October 2026, after A4/K7-ci

**Purpose and chronology.** Mandatory `LAB.md sync` at this corrective-wave close, not a research session. The prior brief commit is `716719b309fb80551427004dedba0577b93dfa94`, actually committed at `2026-10-06T20:44:05+08:00`; its written replacement timestamp was earlier. Accepted first-parent merges since it are A4 `691cfd29693bb5ae10a76514b5cf70ad4dd87197` and K7-ci `692ab731dbe8c0310fbbbbe07471f11ea74680fe`: two waves. Fetched accepted master `b194ceda57cbf20ee55be4a00792a3ea8c4a825f` and merged it into lab without conflicts as `49115e44ebc5e680b06284cba59c1ba1b5b1f18a`. No writes to main worktree or master.

**What was done.** Read researcher role, LAB sync route, charter/programme/brief, AGENTS/STATUS, line README and prior sync entry; read accepted BACKLOG's For the lab and A4/K7-ci/K7 records. Corrected only lab-owned current README/programme/brief and appended this entry; prior entries, including A4 pending in the previous sync, remain faithful historical records. Accepted master documents/code arrived through Git merge, not manual edits. Replaced the brief and answered the CTO; no stage, priority, line opening/closure or transfer changed.

**Accepted observations, not new lab findings.**

- A4 is accepted on `ed60a2c`, not pending. Actual sealed npm/Python folder-only agent submissions pass owner verification against pristine exported manifests. Each no-op/empty/deleted/written-wrong/tamper/alternative-right verdict retains its mutation/log: negatives reject or refuse at seal, alternatives accept. Immutable read-only guards address those fixture tamper cases, not the general editable-assertion blind spot. Check authorship and fixture development are separate from approximate declaration/export clocks/manual steps. Local blindness is instruction-only; these are agents and purpose-written capability fixtures, not real outside issues, humans or a controlled effort comparison. Tiny fixtures disclose all selected fixture source; non-string npm paint behavior lacks coverage.
- A4 dependency advice was adopted: pinned picocolors@1.1.1 with recorded integrity, no install/dependency scripts, declared npm.cmd ci --ignore-scripts; the independent pass repeated offline from cache. Original dependency files unchanged, excluded member source absent, selected source and real package execute. Installation success alone was not acceptance; no package downloaded by this sync.
- A4 first review failed the 330s executed budget at 364s. Isolated copies of invocation-local pristine fixtures corrected acceptance to 325s, only 5s headroom. Corrected SHA also had an extra dirty full run and only 46s before clean repetition; both records count as retained process violations, not waived or hidden by the final clean PASS.
- K7-ci cook and pass each reproduced frozen pinned pnpm adding exactly four root-lock lines: two empty importers for examples/a4-multi-pkg and examples/a4-npm-cli. This caused hosted A4 UNCOMMITTED despite green named tests. Lock normalization changes no versions. Importer-parity regression, dirty preflight before expensive work and end-status recheck ship; mid-run dirt or unreadable status cannot be PASS. Candidate `3300fed` has one executed clean Windows acceptance PASS (123s); independent pass reused that record and separately attacked setup mutation, dirty start and end state. No new acceptance run here.
- Hosted repair run `37519849444` was in progress at the last accepted kitchen query; this sync did not query it or establish green/Linux success. Main K7 speed/cleanup/profile and broader same-SHA/cooldown accounting remain pending: the sole allowed wave was redirected to red-master repair. Five baseline and five parallel same-commit full measurements still require the owner's bounded exception, not silent repeat acceptance.

**Reply / next.** Acknowledge adoption of A4 mutation/dependency/provenance advice and K7-ci correction. Close this corrective wave and stop after sync. For a separately named K7 restart, check hosted status and obtain the measurement exception; this restates the accepted decision, not a new lab gate. No R3b, D4 or K9 ran, and useful outside-issue delegation remains unmet. Additional export-time mutation probe and argument-name warnings remain deferred advice. Future research remains guide version 1 and a predeclared outside sample; harness work should drive accepted product export/verify and consume A2 paired records. Prior lab evidence, non-held-out limitations, decoded-text/non-causality qualifications and literature claims are unchanged.

**Method and limits.** No tests, experiments, installs, downloads, new literature/issue survey, recipient work or sceptic review ran; no model identity/diversity claim is made. A required code-search tool was attempted only for document locations and returned no relevant results; it supplied no findings or review. Pstack guard-the-context-window (read this run) kept reads to relevant current records and a short prior notebook slice; boundary-discipline's compatibility contract (read this run) prevented treating method guidance as authority to change rules. No rule/security-policy/global-config edits or unrelated cleanup. Commit and non-force push only to the existing private origin lab branch conclude this sync.

## Sync only — 7 October 2026, after K7-ci2/K7a/R3b-1/R3b-2

**Purpose.** `LAB.md sync`, run for the lab lead at the R3b close; not a research session. Prior brief commit `f34544b` at `2026-10-07T03:39:09+08:00`. First-parent merges on master since it: K7-ci2 `8b8df74`, K7a `981e8c5`, R3b-1 `5e029df`, R3b-2 `028066c`. That is four; the head chef's "For the lab" counts three and omits K7-ci2. Fetched and merged `origin/master` (`028066c`) into `lab` without conflicts as `f021d18`.

**What was done.** Read the role file, charter, sync route, programme and previous brief; read from `origin/master` STATUS, BACKLOG "For the lab", the four wave files' results, `r3b/SCREEN.md`, `r3b/RESULT.md` and the head chef's solver record. Replaced the brief. On this line's page: the sync line, the U4 row, one "kitchen record" bullet under the current best answer, and open thread 6. PROGRAMME.md was not edited, on instruction; its "Sync state" paragraph is now out of date and the brief says so.

**Kitchen records taken in, with their stated limits (replay; one case, one solver, one run; one model family; the solver saw the acceptance test; blindness by instruction only and weaker than intended; outcome check silenced; control not run).**

- R3b-1: 200 merged pull requests listed, 8 candidates, 7 with a right-reason red-then-green maintainers' test, 3 of those with a linked issue. The pass read that in 2 of the 3 the issue body's suggested fix fails the maintainers' test. #2609's comments were not saved.
- R3b-2, case #2615: 39 files (17.8% of files, 36.0% of bytes) by a rule fixed before export; six export attempts, five refused, two of them the paired check refusing on printed run times; export only with a silent reporter. Verify exit 0 on the solver's change, exit 3 on a no-op and on four structural negatives from the pass. Solver and maintainers differ on 4 of 14 probes chosen after the fact; both pass 1,421 of 1,421.

**Corrections to this line's own record.** Session 4 offered "the same check gives the same output in the full repository and in the Box" as the export-time proxy for U4 and did not consider output that varies between runs of the same code. The kitchen built whole-output digests and met exactly that. The proxy is now marked as open. Open thread 6 (R3b as a source of cases) is delivered for one project.

**What this sync does not say.** No count here is a rate. The solver's answer is not labelled right or wrong. The request-against-test disagreement is three cases read by one reviewer; the line's survey already records that maintainer tests can reject valid solutions, and this sync does not count R3b as confirming or measuring that. Nothing was run, fetched from the web or reviewed by a sceptic.

**Next.** Guide version 1 with a request-against-check column, then the predeclared outside sample; Line 3's survey, including comparison of test output across runs, if the CTO agrees where that question lives; experiment 03's plan rewritten around the R3b-2 refusals before anything runs.

## 7 October 2026, session 5: guide version 1 and outside sample 1

**Set out to do.** The standing direction's first item: labelling guide version 1 with the column "does the request text determine what the check asserts", counted on a sample declared before it is read. R3c will hide the acceptance test in some cases, so anything on request and check disagreeing goes to the CTO now.

**Before starting.** Merged `origin/master` (ten commits, through fix-paired-check `f47414f`). Read the programme's updated standing direction, the last brief, "For the lab" (paired-check advice taken; programme recommendations adopted), STATUS and PLAN's "Where we are". Light work only: no installs, builds or test runs.

**Did.**

- Wrote `map/GUIDE.md` version 1 (version 0 kept as `GUIDE-v0.md`): one condition as the unit; columns for what it is about, where a check could come from, outcome or guard, seen from outside, and for fixed issues whether the earlier text determined the fix's tests.
- Wrote `map/sample-1/PLAN.md` with five predictions and committed it (`4c7ae9a`) before fetching. Four repositories named in advance by the lead for spread; issues inside each by GitHub search, newest first, 5 open and 5 closed-as-completed with a merged closing pull request.
- Fetched with `fetch.mjs` through the host's `gh`, read-only: 40 issues, no shortfall. Kept bodies, all comments and test diffs. Fetched the three R3b-1 commander.js cases the same way and kept them apart.
- One fresh agent split the issues into conditions; two more labelled them blind to each other; the lead labelled nothing. A fourth, as sceptic, re-derived the consequential labels against the real pull requests.

**What happened.**

- Agreement was near perfect: kappa 0.95 on source, 1.00 on determined. I predicted 0.4 to 0.6 on the last. Two instances of one model reading one guide agree; that is all it shows.
- Three of five predictions failed. I expected a quarter or more of issues to ask for nothing (1 of 40; the sampling frame excludes not-planned and duplicate closures, and half the sample is fixed issues). I expected 20 to 40% of fixes to have no test (12 of 20). I expected some tests to contradict their issue outright (none labelled so).
- First write-up claimed: over a third of outcomes carry their own check; more than half of fixes change no test; tests usually assert more than the issue says and never contradict it.

**The sceptic's corrections** (`map/sample-1/SCEPTIC.md`). All three claims moved.

- "More than half of fixes change no test" does not stand: seven of the twelve change no behaviour at all, and the other five are one repository. Among behaviour-changing fixes, 8 of 13 have tests.
- "Over a third carry their own check" drops to about a quarter of conditions and a third of issues once literal edit requests and a retracted proposal are taken out.
- "Never contradict" was true of the labels only: reading the diffs, in 3 of 11 cases a fix the issue suggests would fail the tests.
- Two faults in my instrument: comments were marked against the time the pull request opened, when tests are often added later; and in half the fixed cases the reporter wrote the fix, so "issue against test" is one person describing their own patch.
- Kappa 1.00 on determined rested on eight judged rows; twelve were given by the file.

**Fourth session in which the lead's first write-up claimed more than the evidence.** This time the lead did not label, so the bias moved from the labels to the reading of the counts: I took a count over "recently closed issues" as a count over "fixes". The structural defence that worked was the sceptic checking against the real pull requests. Keep it as a fixed step for any count that goes to the CTO.

**Surprise followed.** The no-test fixes. I expected them to be bug fixes merged without tests. Seven were not fixes of behaviour at all. The category "issue closed by a merged pull request" is much wider than "bug fixed", which matters for any screen the kitchen runs for replay cases: R3b-1's rule (a maintainers' test red at base, green at fix) already filters these out, and the lab's count says that filter keeps roughly 8 of 20 recently closed issues in projects like these.

**Dead ends.** None fetched or run failed. Not done: the re-test of version 1 on the pilot's 79 bullets (the outside sample took its place); a labeller of a different kind.

**Next.** In the README's open thread 1: turn the sample's reproductions into declared commands and run them on the base; test whether an answer that follows only the issue passes the maintainers' tests (coordinate with R3c); guide version 2. Then Line 3's survey, as the programme orders.
