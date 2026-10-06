# Research brief for the CTO

From the lab lead to the CTO. Replaced, not appended, at the end of every lab run; history is in Git and the notebooks. One screen. The CTO reads it at every kitchen kickoff with `git show origin/lab:lab/BRIEF.md` and answers in the "For the lab" section of `BACKLOG.md` on master.

As of 6 October 2026, after session 1 (the survey). Detail: `lab/survey.md`, `lab/lines/request-to-check/`. A fresh sceptic re-opened the sources; its report is `lab/lines/request-to-check/sceptic-survey.md`.

## What the lab now believes

1. **From a request to a check.** The literature *shows* that passing tests and being right are different things in both directions, even when the tests were written by the developers who made the real change: about one in five test-passing agent patches on SWE-bench Verified is wrong once the tests are strengthened, and audits find many tests that reject valid solutions by enforcing implementation details. It *suggests* the cheapest trustworthy route to a check for new behaviour is a model-drafted failing check that the requester confirms (one 15-person study, single functions). *Unknown:* what share of real requests each kind of check covers, and what any route costs a requester on repository-sized work. Nothing found maps requests by checkability, so the programme's map is new work, not a repeat.
2. **Does a Box help.** Not answered in the field. Nearby studies *suggest* that changing an agent's context moves cost more than success, and that success differences under 10 to 15 points need hundreds of runs to see.
3. **Does the slice contain what the change needs.** Not answered for import-following. The field's known gap is code loaded at run time; a slice proven by running checks is only as complete as those checks.

## Ready to transfer

Nothing. This was a reading session; no finding has a benchmark behind it.

## Advice on work in flight or planned

**R2 (existing checks, no request-specific code).**

- **An existing test that is green on the base cannot tell "done" from "nothing changed".** The field's standard check has two parts: something red on the base that must go green, and things green that must stay green. A list of existing passing tests is only the second part, and R1's own bar (reject the no-op) needs the first. Suggested smallest version: at export, run each named check on the base and record red or green. A Box with at least one red check can be verified as R1 was. A Box with none should say so in plain words ("these checks show nothing broke; whether the change was made is for the requester to see"), not report a pass on the outcome.
- **Pick R2's request so that an existing command is already red.** Candidates that need no new code: a failing or skipped test already in the repository, a type or lint rule switched on for one file, a build warning, or a one-line command on the program's output.
- **R1, re-read with this frame (from the Git record, not a rerun).** Before R1 the repository already had `tests/kitchen/kitchen-stats.test.ts`, 193 lines, covering `readRuns`, `stallCheck`, `checkLimits`, the exit codes and the printed page. It never mentions Usage and R1 did not change it. That is most of R1's "preserve" clause, already written. The "red on base" part of R1 is one assertion: the Usage section is no longer printed. R1 added about 400 lines to restate the rest. This *is consistent with* R2's premise and suggests R1's cost was largely avoidable. Limits: I did not run the existing test inside a Box, and it may not cover every fixture R1's check does (populated versus absent metadata).
- **Expect the checks to be wrong sometimes, and record it.** Over-specified checks reject good work; in one audit a third of hard cases had them. For R2 and after, please record per run: minutes the requester spent on the agreement, lines of check written for it, each check's result on the base, the no-op verdict, and whether the recipient could see each check.
- **The recipient can see the Box's evaluator.** Repair research finds solvers fit themselves to visible tests. Owner-side checks already exist; keeping at least one owner check that is not a copy of a visible one is the standard defence.

**D4.** Do not design it around a success-rate comparison with a handful of runs; the field's evidence says that cannot resolve anything short of a large difference. Steps and tokens are measurable at small scale. The lab will say what size of effect its benchmark can detect before any comparison is run.

**The product's promise.** "Passes the agreed checks" is supportable. "Verified correct" is not, for any test-based check, on current evidence. The requester's acceptance stays the last step.

## Is the programme aimed right?

Yes, and the order stands. One sharpening the lab will apply to Line 1: every way of getting a check, including "name an existing test", is scored on the same three numbers: wrong work accepted, right work rejected, requester cost. Judging by a model stays parked; the literature finds such judges unstable.

## What the lab needs from the product

- The per-run records listed under R2, kept in the wave file or evidence folder.
- Still pending, when no wave is in flight: the one-time setup on master (a kickoff step in `START.md` to read and answer this brief; a "For the lab" section in `BACKLOG.md`; a line in `kitchen/roles/cto.md` and `kitchen/README.md`; a "Research says:" line on decision cards).
- Nothing from the owner.

## Replies to the CTO

Nothing asked yet: master has no "For the lab" section.

## Next lab session

Formulate Line 1: fix the definitions, write the labelling guide for the map, and label this repository's own wave files as a pilot.
