# Line: from a request to a check

Stage: formulated, then re-formulated for the neutral core (session 4); instrument next · Opened: 6 October 2026 · Close or continue when: the map of real requests shows what share each source of check would cover. If nearly all real requests can only be decided by the requester reading, there is no method to study and the line closes with that as its finding. (The other closing condition written in session 2, "nearly all fall under an existing check already fails", now looks unlikely: see the outside sample below.)

This page shows the current state. History, including what earlier versions of this page claimed and why it changed, is in `notebook.md`.

Synced through accepted master `d7ced3c` (A2/A3), 6 October 2026. Reading/writing only; no new lab evidence or stage change. The sync entry in the notebook separates current kitchen records from historical lab results.

## The product need

Line 1 in [PROGRAMME.md](../../PROGRAMME.md). Delegation pays only if saying what "done" means costs much less than doing the work. If this line succeeds, a person handing over a change in any repository spends minutes agreeing a check, and knows how far to trust its verdict.

The product changed under this line on 6 October 2026 (`PLAN.md`, "Milestone A"): its core now knows only files, commands, exit codes and patches. Nothing below assumes a language, a package manager or a test runner.

## The problem, stated precisely

Re-stated in session 4 for the neutral core; the notebook entry for that session says why. Change it only with a notebook entry.

**Terms.**

- A **Box** is a set of files copied from a base commit, a list of **setup** commands, and a list of **checks**. Some files are **editable**; the rest are not.
- A **command** is a program, literal arguments and a working directory, started with no shell. Its **result** is one of three: `pass` (exit 0), `fail` (it ran and exited non-zero), `error` (it did not start, timed out or was killed). An error is never a pass and never a fail (A0, `neutral-box.mjs` line 26; A1, `SUBMISSION-CONTRACT.md`).
- A **check** is one declared command with a **role**. A **guard** says "this already works and must keep working". An **outcome** check says "this is what was asked for" (session 2 called it evidence of change). A check runs in a **context**: the owner's full repository, or the Box.
- A **request** is text plus a base. A **clause** is one acceptance condition in it. A check decides a clause, not a request.
- A **candidate** is a patch to the editable files. It is **right** if a requester who read and ran it with full understanding would accept it, and **wrong** otherwise. In a benchmark, right and wrong are fixed by construction.
- The **verdict** on a candidate is `accept` when, after applying it, every guard and every outcome check passes; `reject` otherwise; and `no verdict` when the base is not valid (below).
- A **route** is a way of obtaining a declared check for a clause. Six are in view, cheapest first: name a command the repository already has; turn a reproduction the request itself contains into a command; write a new test file and a command that runs it; have a model draft one and the requester confirm it; have the recipient write one and the owner review it; none, the requester reads the result.

**What must be true of a set of declared checks for it to be usable.** Each condition is stated so that it can be observed with commands and exit codes, or it says plainly that it cannot.

| | Condition | Observable how | Where the product stands (kitchen records, 6 October 2026) |
|---|---|---|---|
| U1 | Every setup command passes and every check starts, in each context. | Run them. | A1 preflights programs before declared execution; A2 runs recipient setup/checks on the untouched base and staged Box, and errors/timeouts refuse export. Prerequisites are established on the export host, not a future recipient host. |
| U2 | Every guard passes on the untouched base, in each context. | Run them. | Enforced: export refuses a failing guard (R2, `export.ts`). |
| U3 | At least one outcome check fails on the untouched base, and none passes there. | Run them. | Partly: export warns when no outcome fails; it does not refuse, and a passing outcome beside a failing one is not flagged (reading of `export.ts` line 215, not run). |
| U4 | Each outcome check fails **for the right reason**: because the requested change is absent, not because a file, a tool or a setting is missing. | Not from an exit code alone. A known right change turning it green is supporting evidence. Proxies at export: the same check gives the same output in the full repository and in the Box; a guard through the same program and files passes. | A2 enforces paired result/exit and full normalized UTF-8-decoded stdout/stderr digests for recipient checks. Same-exit/different-diagnostic omissions refuse, including beyond-tail and NUL-partition attacks. Matching text is not causal proof; invalid UTF-8 byte differences can compare equal. |
| U5 | Each guard passes **for the right reason**: because it exercises the Box's copy of the code, not because it tests nothing there or tests some other copy. | A candidate that destroys the editable files (emptied, deleted) must turn at least one guard red. | Not checked by the product. |
| U6 | After a right change every check passes, for at least two right candidates produced independently. | Run them on candidates. | R2: 2 right, both accepted. A3 cook's recorded replay accepts the fix and `void repo` alternative; not a new independent lab baseline. |
| U7 | After a wrong change at least one check fails, for a fixed set of kinds of wrong change. | Run them on candidates. | R2: 5 wrong, 4 rejected. A3 records no-op/cosmetic wrong edit/guard-breaking rejection and weakened-guard acceptance; the pass independently rejects empty edit and the specific removed-parameter/unchanged-caller case by declared checks. Do not collapse distinct mutations into a five-candidate replay claim. |
| U8 | The solver cannot change, replace or skip a check, and passing the checks it can see does not guarantee passing the ones it cannot. | Structural: no check reads a file in the editable set; some check runs only on the owner side. Then by trial: candidates written to pass without doing the work. | Not enforced. R2's guard was the editable file itself, and a candidate with gutted assertions was accepted. |

U1 to U3 are **base validity**: without them there is no verdict. U4 and U5 are what separate a check that works from one that merely has the right colour. U6 to U8 are what the line measures.

**The fixed kinds of wrong candidate.** The list grows and never shrinks: no change; an empty or deleted target; the surface reworded without the substance changed; something next to the target deleted as well; a preserved interface broken; the right result with leftovers the request said to remove; and, added in session 4 from R2, **a check the candidate can reach is weakened**. The first two need no knowledge of the language and can be generated by the harness for any Box.

**What a solution must do.** A route is better than the baselines on a clause if its check costs the requester less and accepts no more wrong work and rejects no more right work on the same candidate sets. Two baselines now exist in this repository: a purpose-written test (R1) and an existing command named in the agreement (R2). The line succeeds if some route does that on most clauses of real requests from repositories the product has not seen.

**What would show the formulation is wrong.** Two labellers cannot agree which route decides a clause; right and wrong candidates cannot be told apart by two people who read the request; cost in lines and items does not track what a requester finds expensive; or U4 turns out to be undecidable at export in most real cases, in which case "usable at export" is empty and a check can only be validated after the fact.

Out of scope: judging outcomes no command can express (parked), ranking several candidate solutions (parked), and whether the recipient can do the work at all.

## Where the field is

Called the test oracle problem, fail-to-pass and pass-to-pass testing, patch plausibility versus correctness, reproduction-test generation and intent formalisation. Hand-written tests from the original developers pass some wrong solutions on the best-studied benchmark (estimates from about 1% to 20% by method) and can reject valid ones (61% of a random sample flagged as at risk; rarely observed directly). Models write a test that goes red-to-green on the known fix for about 63% of Python bug reports, which is not yet a trustworthy check, and generated tests tend to encode current behaviour. People asked to confirm machine-written checks approved a quarter to over a half of the wrong ones in the one study read in full (Staats et al. 2012; students, not owners). Most real pull requests carry no test, and benchmarks exclude exactly those; the fail-to-pass test in those benchmarks comes from the pull request that fixed the issue, not from the repository before it. Detail in [related-work.md](related-work.md). Not surveyed yet: mutation testing as a way to score a guard (U5), named in the survey only.

## Metric and benchmark

Four numbers for a check set on a request. Each is a count over a stated set, never a rate, until the sets are large and not hand-picked.

| Number | Measured on a neutral Box as | Limits to carry with it |
|---|---|---|
| **Wrong work accepted** | Of the wrong candidates, how many get `accept`. Reported in three groups: generated (no change, each editable emptied, each editable deleted); written by an agent that has not seen the checks, one per kind above; and gaming (next row). | Hand-made candidates probe what their author already understood. In experiment 01 all 26 predictions by people who had read the checks came true. |
| **Right work rejected** | Of the right candidates, how many get `reject`. Needs at least two produced independently. | One accepted change cannot show this. |
| **Requester cost** | Counted from the agreement and the export record: check and setup commands declared; characters of arguments written; files written for this request (the "useful" milestone requires none); export attempts before the base was valid; items to read and confirm (base results, warnings, failure output). Minutes only from recorded stage clocks. | No kitchen wave has recorded stage clocks yet: R2's minutes are self-reports and R3 selected no issue. Minutes are reported as missing. |
| **Resistance to gaming** | Two parts. Structural, counted from the declaration: checks whose arguments name an editable file; checks the solver can see; checks that run only owner-side. By trial: candidates written by an agent that is given exactly what a solver gets and is told to pass without doing the work; how many get `accept`. | The structural count is a crude proxy: a check can read an editable file without naming it. |

Before any of the four: **base validity**, as a count of Boxes attempted against Boxes whose base met U1 to U3, with the failures named.

**The instrument: a candidate-set harness.** Not built. Input: a declaration (files, setup, checks with roles and contexts) and a folder of candidates, each a patch tagged right or wrong and with its kind. Output: the result of every check on the base and after every candidate, the verdict per candidate, and the four numbers. One command reruns it.

What it reuses from the kitchen's A0 prototype (`research/box-delegation/a0/`): the shape of `neutralLoop` (copy the declared files to a clean folder outside any checkout, run setup, run every check, apply a patch, run every check again); the record per command (program, arguments, working directory, exit, start error, duration); the three-way result with "a command that never started is not a red check"; the `invalid-base` verdict; the result table in `run-all.mjs`; and the four fixture variants, each with a guard, an outcome check and a known-good patch, as the first four cases. What it must not reuse: the loop applies one patch per run, uses fixed folder names, deletes its working folder without checking it, does not contain `..` in declared paths, inherits the whole environment, and needs Git to apply a patch (A0 review, `waves/A0.md`). It also sidesteps the Windows launch problem by having the owner compute a script path; the product's rule for that is in A1.

A3 is accepted. The next harness should drive the product's own neutral `export` and `verify` and read their verdicts, so it measures the product and not a lab copy of A0. A0 remains historical design input, not the preferred execution route. A2 supplies the paired base/Box records; the lab should consume them, not duplicate pairing. No harness was built or run in this sync. Running it installs packages and runs test suites, so it is a heavy job.

**What replaced the harness planned in session 3.** That plan was "run experiment 02 over every test file in this repository and count how many travel". It assumed the old agreement format, source selection by TypeScript imports and vitest. Under the neutral format, "does this check travel" is the question "does this declared check give the same result in the Box as in the full repository, on the base", for whatever file list the owner declared. A2 has delivered that comparison, with paired result/exit, bounded tails and complete normalized decoded-text digests in `box.json`. The lab should not build a second one; use these records and retain the decoded-text and non-causality limits.

**The other instruments.**

- **The map** (`map/`): real requests split into clauses, each labelled with the cheapest kind of check that could decide it. Guide version 0, piloted on 79 wave-brief bullets (two blind labellers, kappa 0.71) and applied by one labeller to 5 outside issues (`map/outside-sample/`). Guide version 1 is specified in `map/pilot/RESULT.md`, extended in `map/outside-sample/RESULT.md`, and untested.
- **Candidate sets so far**, all hand-made by people who had read the checks, none held out:
  - Experiment 01 (R1's request): 13 wrong, 4 right, two checks. The runners use the old format.
  - R2, from the kitchen's records (`research/box-delegation/r2/evidence/`): 5 wrong, 2 right, verdicts by the product's own owner-side verify.
  - A0's four fixture variants: 1 right and "no change" each.

## Baselines

None run on a benchmark. When methods are compared: the simplest is "existing commands only" (R2's route); the best published are a generated fail-to-pass test (e-Otter++ style) and requester-confirmed tests (TiCoder style). Read Liang et al. (arXiv:2609.12012) before fixing this list.

## Current best answer

Only what stands on 6 October 2026 after the product change. What no longer stands is listed in the notebook, session 4.

From this repository:

- **Shows** (one request, lab experiment 01, reproduced by a fresh agent; old format): a purpose-written check accepts wrong work and rejects right work, and the test that already existed catches wrong work it misses. Neither contains the other.
- **Shows** (one request, kitchen wave R2, reviewer's own runs): a set of existing commands named in an agreement can reject "no change" and accept two different right changes with no code written for the request; and the same set accepts a wrong change that guts the assertions of the guard, because the guard was an editable file. Counts: 2 right, 0 rejected; 5 wrong, 1 accepted. Historically, one rejection came from implicit compile. A3 removes that neutral-path step; its independent pass now records the specific removed-parameter/unchanged-caller candidate rejected by `unused-param-outcome` (`waves/A3.md`, reviewer verdict). That concern is answered for this candidate, not for arbitrary wrong edits. Editable assertion weakening still passes. The request was chosen because a compiler flag already failed on it.
- **Shows** (existence, three separate observations): a step that reports success before the check runs says nothing about whether the check can run. Export reported no gap for three tests that then failed in the Box for missing files (lab, experiment 02, old exporter); `tsc` exited 0 in all six of those Boxes; a locked install exited 0 with a needed package missing, on npm 11.6.1 and pnpm 10.34.5 (kitchen, A0, tiny fixtures with no outside dependencies, one Windows machine). Only running the check shows it.
- **Shows** (kitchen, A0 result table): an exit code does not carry the reason. The outcome check exited 1 both in the slices where it was red because the change was missing and in the six trials where it was red because a package was missing. In all six, the base was caught as invalid only because the guard was red as well; in those fixtures the guard and the outcome check load the same module.
- **Suggests** (79 bullets, one author, one repository, guide with known faults): in our own briefs an existing check alone decides about one clause in ten; a short command could decide about three in ten; the rest need a purpose-built test or a person.
- **Suggests** (5 issues from one outside repository, chosen by a kitchen cook by an unrecorded method, labelled by one person from one-line summaries): for bug reports against a repository whose tests are green, guards are plentiful and an outcome check never already exists; what does sometimes exist is a reproduction in the report itself. Counts: 0 of 5 with an existing failing check (kitchen's finding, on weak per-issue evidence); 2 of 5 where the kitchen's record quotes a one-expression reproduction; 2 needing a constructed test; 1 not labellable. Detail in `map/outside-sample/RESULT.md`.
- **Is consistent with** the above, and is reasoning, not a finding: an open bug with an existing failing test is close to a contradiction in a repository that keeps its tests green, so a rule that only admits such issues admits almost none. The field's benchmarks get their failing test from the fix, after the fact.
- **Suggests** (seven hand-picked tests, old exporter): a test that reaches its code by import was carried by import-following selection; a test that starts or reads files by a path built at run time was not. This is now a statement about the optional TypeScript helper, not about the product's core.
- **Not shown:** that preparing a check is cheap for a request nobody chose for its convenience. R1's kind of request ("remove this section") still has no cheap outcome check that anyone has demonstrated.

From the literature, after the sceptic's review (`sceptic-survey.md`):

- The literature **shows** that passing tests is not the same as being right, even with developer-written tests. Wrong work accepted: shown, at a rate that depends on the method (about 1% to 20%). Right work rejected: shown to be possible and widely flagged, not measured as a rate. One benchmark family: Python libraries, agent-written patches.
- **Hypothesis, not a finding:** a model-drafted failing check that the requester confirms is a cheap, trustworthy route. The one human study read in full counts against it; it goes to the benchmark as one candidate among several.
- **Hypothesis, not a finding** (new in session 4): the cheapest route for a bug report nobody has seen is the reporter's own reproduction turned into a declared command. It rests on 2 of 5 cases and on nothing measured.
- **Unknown:** what share of real requests each route covers; what a check costs a requester in minutes; how any route holds up against a solver trying to pass without doing the work, beyond R2's one constructed case.

## Open threads

In order. "Heavy" means it installs, builds or runs test suites, so the kitchen must be idle (`node lab/tools/kitchen-busy.mjs`).

1. **Guide version 1, then a real outside sample for the map.** Light; needs free reading of public issue trackers. Version 1 as specified in the pilot, plus three columns the outside sample showed are needed: the colour on the base (guard or outcome); where the check would come from (the repository, the request's own text, written new, a person); and whether an existing check asserts the behaviour the request wants changed. The sample is declared before it is read: a fixed rule for which issues, from more than one repository and more than one language, open and recently fixed, not chosen by hand; two blind labellers.
2. **The candidate-set harness, driving accepted neutral export/verify on recorded cases.** Heavy. Reuse A2's paired records and A3's declarations; A0's fixtures and R2's candidates are historical inputs. First use is a shakedown, not a finding.
3. **Experiment 03: residual U4 and U5 gaps after A2.** Heavy; write a revised plan before running. Do not repeat the delivered same-exit/different-output negative as new research. Matching decoded diagnostics still leave causal ambiguity; for U5, ask whether an emptied editable exposes a guard reading another copy. The product mutation probe remains deferred; A4's candidate attacks are not an export-time implementation of it.
4. **A gaming trial.** Heavy, and needs the lab lead to start agents. A fresh agent gets exactly what a solver gets and the instruction to pass without doing the work; score with the harness. Seed case: R2's weakened guard. Needs Boxes with real checks, so it follows A4 or R3b.
5. **"Remove this" requests.** A before-and-after comparison of output was never tried as the outcome check for R1's kind of request. Under the neutral format it would be a declared command that compares output with a stored expectation; who writes the expectation is the cost.
6. **R3b as a source of benchmark cases.** Each replayed issue gives a base, a right candidate (the maintainers' fix) and a check (their test): the field's standard construction, with its known filter. Ask the kitchen to keep those tuples and the number of issues screened to find them.
7. **Unread:** Melnik et al. 2006; Fraser et al. 2015; Liang et al. in full; anything on mutation testing as a score for guards.
