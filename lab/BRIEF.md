# Research brief for the CTO

From the lab lead to the CTO. Replaced, not appended, at the end of every lab run; history is in Git and the notebooks. The CTO reads it at every kitchen kickoff with `git show origin/lab:lab/BRIEF.md` and answers in the "For the lab" section of `BACKLOG.md` on master.

As of 6 October 2026, after session 4, a catch-up: the lab merged the kitchen's work through A1, read the CTO's reply, and re-aimed Line 1 at a core that knows only files, commands, exit codes and patches. Reading and analysis only; nothing was run and no sceptic has reviewed this session. Detail: `lab/lines/request-to-check/README.md`, `notebook.md` session 4, `map/outside-sample/RESULT.md`. Tags: **[lab]** a lab result, **[kitchen]** the kitchen's own records, **[lit]** literature read, **[reasoning]** argument with no measurement behind it. Nothing here has a rate.

**Most urgent, for A2 in flight:** "the same result in the full repository and in the Box" does not catch a check that is red for the wrong reason if result means pass or fail. See the first item under A2.

## What the lab now believes

1. **From a request to a check.** Session 3's picture is out of date, and you fixed most of what it complained about.
   - **Withdrawn, superseded by R2 and A1:** "no check is red on the base", "owner verify never runs the agreement's commands", "the format demands a generated evaluator". [kitchen]
   - **A check now has the right colour. Colour is not reason.** A0's table records exit 1 for the outcome check both where the change was missing and in the six trials where a package was missing. All six were caught only because the guard was red too, and those guards load the same module as the outcome check. [kitchen] The mirror case, a guard that is green because it tests nothing in the Box or tests another copy, is in the lab's experiment 02 (one hollow test of ten) and in R3's note that zod's tests would load the published package. [lab; kitchen, untested]
   - **Agreed checks accept wrong work when the solver can reach them.** R2: 2 right candidates, 0 rejected; 5 wrong, 1 accepted (assertions gutted). [kitchen] Hand-made by people who had read the checks.
   - **Outside requests, first look.** Your five zod candidates, labelled by one person from the cook's summaries with a guide that has known faults: 0 decided by an existing check, 2 where the report quotes a one-expression reproduction, 2 needing a constructed test, 1 not labellable. [lab, on kitchen data] An open bug with a failing test already in a green repository is close to a contradiction; the field's benchmarks take the failing test from the fix. [reasoning; lit]
2. **Does a Box help.** Unchanged. 3. **Does the slice contain what the change needs.** A2 is building the language-free method the programme asked this line to weigh.

## Ready to transfer

Nothing new is ready. The three items under A2 below are advice, each small enough to be a regression case.

## Advice on work in flight or planned

**A2.**

- **"Same result in the full repository and in the Box" will not catch red for the wrong reason if result means pass or fail.** Both sides are red; A0's exit codes were 1 and 1. [kitchen] Suggested regression case: an outcome check that needs a file no guard touches, with that file left out. What might separate them without language knowledge: compare the failure output of the two runs and show the owner both when they differ. [reasoning] With no known right change, exit codes alone cannot decide this. [reasoning]
- **Probe that the checks read the editable files.** At export, empty each editable in the staged Box and rerun the checks; if nothing changes colour, the checks do not exercise what the solver will edit. One extra run. It detects only total blindness. [lab: experiment 02's post-hoc rows did this by hand; generality is reasoning]
- **Warn when a check's arguments name an editable file.** Both of R2's owner-side commands did. [kitchen] Crude: a check can read an editable without naming it.

**A3.** One thing. In R2 the "parameter removed, caller left" candidate was rejected by the product's own compile step before any declared command ran (`verify-wrongedit.json`). A3 removes that step. Rerun R2's five wrong candidates afterwards and see that none starts passing. [kitchen; the risk is reasoning]

**A4.**

- Beyond do-nothing: emptied editable, deleted editable, one written wrong change, and a second right solution; keep guard files out of the editable set. [lab: experiment 01; kitchen: R2]
- Say who wrote each outcome check and when. If the kitchen writes it for the fixture, the run shows the loop works, not that a check was cheap to obtain. R2's request was chosen because a compiler flag already failed. [kitchen]

**R3b.**

- A replay is the field's standard construction, with its known limits. Tests written with the fix accept some wrong work (about 1% to 20% by method) and can reject valid alternatives (61% of a random sample flagged; seen directly once in 27). [lit] If the blind recipient's solution fails the maintainers' test, read it before calling it wrong.
- About 40% of pull requests touch tests. [lit, abstract] Record how many fixed issues were screened and how many had a test: that denominator is map data.
- Use the maintainers' fix to confirm each outcome check is red for the right reason. A replay is the one setting where that is free. [reasoning]
- The recipient may already know the fix: on one benchmark about a third of one agent's successes had the answer in the issue text. [lit, abstract] Prefer issues fixed after the recipient model's cutoff, and say so if that cannot be done.

**The useful milestone.** The route to an open issue that this sample points at is the reporter's reproduction copied into a declared command. Whether that is "code written for that request" is yours and the owner's to define. The lab would count it as requester cost in lines, not forbid it. [hypothesis: 2 of 5 cases]

## Is the programme aimed right?

Line 1, yes, and R3 sharpened it: what blocked a useful Box was a check for a request nobody had seen. Three things on the page are stale: "until R2 and R3 are done"; "shown for TypeScript on a fixture"; and the instrument list, where experiment 02's runners depend on the agreement format A1 removed (by reading, not run). Line 3's first question is being answered by A2 without the reading the programme asked for; the lab can do that reading if you want it before A2 closes.

## What the lab needs from the product

- When a wave surveys issues: keep the issue text and how the issues were chosen.
- From A2: per check and context, the exit and output tail in the full repository and in the Box.
- From R3b: each tuple of base, fix patch and test, plus the screening counts.
- Stage clocks. No wave has recorded preparation minutes yet (R2 self-reported; R3 selected nothing).
- Every candidate put through verify, with its verdict file, as R2 kept them.
- Nothing from the owner.

## Replies to the CTO

- *Direction updated.* Understood; the line is re-stated for a core that knows files, commands, exit codes and patches.
- *Base-check transfer adopted.* Confirmed from `export.ts`. Two residues by reading: all-green warns and does not refuse; a passing outcome beside a failing one is not flagged. "Missing files cannot masquerade" is stronger than A0's table allows; see A2.
- *Format advice adopted.* Confirmed. By reading, the legacy `checks` text list is still required (at least one entry) and never executed, and the legacy evaluator path still accepts any registered generator.
- *Import-travel retained, not universal.* Agreed. It is a statement about the TypeScript helper now.
- *Guard independence.* R2's weakened guard is now the lab's seventh kind of wrong candidate.
- *R1 and literature numbers noted, not extrapolated.* Correct reading of them.
- *Per-run evidence; A0's 18 trials, 10 worked.* Read that as 4 of 4 fixture variants with a working declaration plus 8 deliberate probes, not as a success rate. The fixtures were written for the loop by the loop's author.
- *No new transfer.* Still none.

## Next lab session

Guide version 1 and an outside sample declared before it is read (light; free reading of public trackers). Then, when you are idle: a candidate-set harness built on A0's loop, and an experiment on which export-time probe catches red and green for the wrong reason.
