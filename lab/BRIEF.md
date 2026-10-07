# Research brief for the CTO

**No wave is in flight, so nothing is marked most urgent.** One thing bears on the wave you recommend next (the paired-check fix); it is the first item under "Advice" below.

**Replaced:** 7 October 2026, sync only, through accepted master `028066c`. Merged into `lab` without conflicts as `f021d18`. The previous brief was committed at `f34544b` (`2026-10-07T03:39:09+08:00`). By the Git count, **four** waves closed since then, not three: K7-ci2 `8b8df74`, K7a `981e8c5`, R3b-1 `5e029df`, R3b-2 `028066c`. Sources: STATUS, BACKLOG "For the lab", `waves/R3b-1.md`, `waves/R3b-2.md`, `waves/K7-ci2.md`, `waves/K7a.md`, `research/box-delegation/r3b/` (`SCREEN.md`, `RESULT.md`, `evidence/wave2/solver-report-2615.md`). Reading and writing only: nothing was run, fetched from the web, reviewed by a sceptic or newly found. **[kitchen]** marks the kitchen's records, **[lab]** the lab's existing records, **[reasoning]** advice that nothing has measured.

**Limits on every R3b statement below, as the kitchen states them:** a replay of a closed issue; one case, one solver, one run of everything; one model family for cook, solver and pass; the solver saw the acceptance test and needed it; blindness was by instruction only and weaker than intended (its session started in the kitchen repository, where wave 1's evidence held the maintainers' fix; no transcript kept; the solver record was added by the head chef after review and is unreviewed); the outcome check was silenced to get an export; the control case was not run. None of it is evidence about open issues or about a requester preparing a Box unaided.

## What the kitchen did, by programme line

**Line 1 (from a request to a check).**

- R3b-1 screened 200 merged pull requests on `tj/commander.js` into 8 candidates under a rule committed first. 7 have a maintainers' test that is red at base by a behaviour assertion and green at the fix; 3 of those have a linked issue. One run per cell. [kitchen]
- The pass read the three with issues and found that in 2 the fix the issue body suggests fails the maintainers' test, and in 1 they agree. One reader, three cases, one project. For #2609 the deciding discussion was in eight comments that were not saved, so that case is "the body does not state it", not "the request does not state it". [kitchen]
- R3b-2 took #2615 through the product. Owner-side verify accepted the solver's one-line change (exit 0) and rejected a no-op and four negatives the pass added (altered agreement, file outside the editable list, content changed after sealing, guard broken; all exit 3). No submission that was wrong in substance but structurally clean was tried, so this adds nothing to "wrong work accepted" for plausible wrong answers. [kitchen]
- The solver's rule and the maintainers' differ on 4 of 14 probes; both pass the full suite, 1,421 of 1,421. The pass notes the neighbour probes were chosen after both answers were known, so 4 of 14 is a description of two expressions, not a rate. Nobody acting as requester judged the solver's answer, so by this line's definition it is neither a right nor a wrong candidate yet. [kitchen; lab definition]
- Requester cost: 2 min 47 s agent time from starting the agreement to an exported Box, 186 lines of agreement data, six export attempts, five refused. Agent clock, one run, schema reading excluded. [kitchen]

**Line 3 (does the slice contain what the change needs), not open.**

- Selection by a rule fixed before export and not from the fix: 39 files, 17.8% of files, 36.0% of bytes, all of `lib/` editable. The fix touched one of them. One case; no narrower or wider rule tried. [kitchen]
- The paired base-against-Box check refused twice on a red test whose only difference was printed run times, and blamed a missing file. Export succeeded only with a reporter that prints nothing, which leaves "same exit, empty output". The case does not show the pairing working on a real test runner. [kitchen]

**Line 2 (does a Box help):** nothing bears on it. No comparison with the whole repository was made. Stays closed.

**K7-ci2 and K7a** are kitchen tooling (fixture-link cleanup that refuses real directories; the packaging suite at three workers). Neither changes a line.

## The lab's earlier advice

- **R3b record-keeping: used.** Issue text verbatim, denominators, base/fix/test per case, check provenance, separate clocks. Two gaps the kitchen names itself: comments were not saved in wave 1, and the solver's start time was not recorded. [kitchen]
- **"Inspect plausible alternatives before calling a maintainer-test failure wrong": used.** The probe ran on three trees and the four differences are reported without judging either answer. [kitchen]
- **Compare output, not only the exit code (session 4, condition U4): used, and as the lab wrote it, too crude.** The line page listed "the same check gives the same output in the full repository and in the Box" as the proxy and did not say what to do about output that changes between two runs of the same code. The page is corrected. [lab; kitchen]
- **"The harness should drive the product's own export and verify": stands, with a dependency.** Until the paired check is fixed, a harness on real test runners would meet the same refusals. Also add to it the three first-use Linux snags the kitchen recorded. [reasoning from kitchen record]
- **Stale and withdrawn:** the previous brief's opening line on K7-ci, and "no R3b ran".
- **Unchanged:** export-time mutation probe and argument-name warnings remain deferred, unmeasured advice.

## Advice on the next product wave (the paired-check fix)

1. **Do not let the fix collapse to exit codes.** The kitchen's own A0 table records an outcome check exiting 1 both when the change was missing and, in six trials, when a package was missing. The silent-reporter workaround is that comparison. [kitchen record; lab session 4]
2. **Have the refusal say what was observed, not a cause.** "Exits identically, output differs", with the differing lines, is what the record supports; "a missing selected file" was not established in attempts 4 and 5. [kitchen record]
3. **A request, not a gate:** keep the raw base and Box output for every paired check in the fix wave, before and after whatever normalisation is chosen, and record which rule removed what. `export-attempt-4` and `-5` are the first two cases of a set the lab can score a "same failure" rule against; the lab has none of its own. [reasoning]

None of this is measured. The lab has not surveyed the question and makes no claim about what the field recommends.

## The two questions you raised

**1. How often do a request and its check disagree, and can that be detected before hand-off?** This is Line 1, and the lab can take it under the current programme. It is the programme's "how often does the resulting check reject a right one" seen from the request side, and the line's own survey already records that maintainer tests can reject valid solutions. Where it goes: (a) a column in labelling guide version 1, "does the request text determine what the check asserts", counted on the predeclared outside sample, which is light work and already the line's next step; (b) detection before hand-off is a method question and waits for the count and for the harness. R3b-1's three cases are the first rows and are too few to be a share of anything.

**2. What is the right notion of "the same failure" between the repository and the slice?** You place it on Line 3. The lab's records already hold it on Line 1, as condition U4 ("red for the right reason") and planned experiment 03. Under the standing direction Line 3 may only do its survey, which has still not happened. So the lab can take the reading half now, as part of that permitted survey, and can take the experimental half only if you say which line owns it. Recommendation below.

A third item, a matter of filing: "two answers, one check, different behaviour" is recorded in BACKLOG as an instance for the parked equivalence stand-in. As PROGRAMME.md words it, that item is about a smaller version of the *source* that behaves like the original. Two *candidate solutions* that differ where no test looks is Line 1's subject (conditions U6 and U7) and the raw material of the parked "calibrated certainty and ranking of candidate solutions". The lab will carry the #2615 pair there.

## Recommendations on the programme (yours to decide; PROGRAMME.md is not edited)

1. **State that the "same failure" question is studied on Line 1 as U4 / experiment 03, with its reading done as the Line 3 survey.** That needs no change of priority and no new line. The alternative, widening Line 3 beyond its survey, opens a second active line before Line 1 has its instrument.
2. **Let Line 3's survey run next after guide version 1,** since the product now has a measured Line 3 number (17.8% of files by a no-hindsight rule) and a blocking Line 3 mechanism, and the lab has read nothing on either.
3. **No change to Line 2 or the parked items.** No line opens, closes or changes stage in this sync. The "Sync state" paragraph in PROGRAMME.md still describes the A4/K7-ci sync and is now out of date.

## What the lab takes up next, on its existing lines

1. Guide version 1 with the request-against-check column, then the outside sample declared before it is read. Light. R3b-1's `cases.json` (3 with issues, 4 without) goes in as known cases, kept apart from the sample.
2. Line 3's survey, including what is known about comparing test output across runs. Light.
3. Rewrite the plan for experiment 03 around the R3b-2 refusals before anything is run. Heavy when run; after the kitchen's fix.
4. Candidate set for #2615: the maintainers' fix, the solver's answer (unlabelled), the no-op, and wrong answers written by an agent that has not seen the checks. Needs the harness. Heavy.

Nothing is ready to transfer. What the lab believes about each need is unchanged from the previous brief, because nothing was run: Line 1 is at instrument-next with small, hand-picked, non-held-out sets; reporter reproduction as the cheapest route is still a hypothesis (in #2615 the maintainers' test does not use the issue's own example, which the line should read before testing that hypothesis, and which decides nothing by itself).

## Needed from the kitchen

- Save issue comments as well as bodies in any further screening.
- Save the solver's report and start time at hand-off, and start a blind solver outside every checkout (both already in your inbox).
- In any second replay, include one submission that is wrong in substance and passes the visible structure, and say who labelled it wrong.

Detail: `lab/lines/request-to-check/README.md` and the sync entry appended to its notebook.
