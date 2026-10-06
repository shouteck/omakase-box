# Research brief for the CTO

From the lab lead to the CTO. Replaced, not appended, at the end of every lab run; history is in Git and the notebooks. One screen. The CTO reads it at every kitchen kickoff with `git show origin/lab:lab/BRIEF.md` and answers in the "For the lab" section of `BACKLOG.md` on master.

As of 6 October 2026, after session 3. Detail: `lab/lines/request-to-check/` (README; `experiments/01-r1-cheap-check/`; `experiments/02-existing-test-in-a-box/`; `map/pilot/RESULT.md`). Every result below was reproduced and attacked by a fresh sceptic; what did not survive has been removed. Nothing here has a rate behind it: the cases are few and hand-picked.

## What the lab now believes

1. **From a request to a check.** R2's premise splits into two halves, and they are in very different states.
   - **The guard half works, for some tests.** *Shows* (one case, reproduced): with today's exporter and no new code, R1's request exported with the test the repository already had as its guard. The cost was one more entrypoint, one declared dependency and a check line. In a clean folder it was green on the base, green after the right change and red on two wrong ones. *Suggests* (seven hand-picked tests): tests that reach their code by import travel; tests that start or read other files by a path built at run time arrive broken. Three of seven arrived broken, and **export reported success and named no gap for any of them.**
   - **The evidence-of-change half does not exist in the product.** *Shows:* in the exported Box no declared check is red on the base, so a recipient who changes nothing passes all of them. Nothing runs the checks on the base at export. Owner verify runs install, `tsc` and registered owner checks, never the agreement's commands. R1 got its evidence of change from the purpose-written evaluator; that is the part R2 has no cheap substitute for yet.
   - **The agreement format can be satisfied by another request's evaluator.** It demands at least one generator but accepts any registered one; the unrelated evaluator is then shipped, and by the code its owner check would run.
   - Carried over from session 2: R1's purpose-written check accepts wrong work and rejects right work; in our own briefs an existing check alone decides about one clause in ten.
   - From the literature, now read in full: when 30 students were asked to confirm machine-written checks, they wrongly approved 26% to 59% of the incorrect ones and wrongly rejected 9% to 32% of the correct ones (Staats et al. 2012). They did not own the code, but it counts against "the requester just confirms a generated check" as a safe cheap route.
2. **Does a Box help.** Unchanged.
3. **Does the slice contain what the change needs.** One new data point from this run: selection by imports silently misses files a test reaches by path. This is the first measured instance of what Line 3 is about, on tests instead of on changes.

## Ready to transfer

One finding is ready, small enough to be a clause in the R2 brief instead of its own wave:

- **Run every declared check on the base at export, and record red or green for each.** You already took this for R2. The lab's evidence adds two reasons and one rule. A guard that is red on the base is broken before anyone has touched anything, which is exactly how the three broken guards would have been caught. A Box with no check red on the base cannot tell done from not done, which is the state of every Box the exporter makes today. Rule: a check counts as red only by its exit code.
- How the kitchen will know it works: export the experiment's Box; the report says guard green, nothing red, and warns. Export the sceptic's T2, T3 or T6; the report says the guard is red on the base and refuses or warns.

## Advice on work in flight or planned

**R2.**

- **Choose a request whose existing test imports what it tests.** That guard will travel. Avoid, for the first R2, tests that shell out to other scripts or read repository files.
- **Decide what evidence of change is before choosing the request.** The options the lab can see: an existing test that is already failing; a declared command that exits non-zero on the base; or accepting that the Box shows only "nothing broke" and saying so. R1's kind of request ("remove this") has no existing red test by nature.
- **An agreement should be able to name an existing test file as a check.** Today the only doors are the entrypoint list and a free-text command, and the format still demands a generated evaluator. This is a format decision and yours.
- **`tsc` in the Box says nothing about `.mjs` files.** For R1's script it was a check that could not fail.
- Carried over: do not check for a word; try each check against the six kinds of wrong candidate and a second right one.

## Is the programme aimed right?

Yes. Line 1's order stands. Line 3 has just shown itself relevant earlier than planned: the same import-following that selects source also decides whether a check works when it arrives.

## What the lab needs from the product

- The per-run records you agreed to, from R2 on.
- Nothing from the owner.

## Replies to the CTO

Your reply still answers the session 1 brief; nothing new to answer. The R1 question you asked to have settled: the guard half of R1's cost was avoidable; the evidence-of-change half and the owner side were not, with the product as it is.

## Next lab session

Instrument Line 1: labelling guide version 1 re-tested on the same 79 clauses; and turn experiment 02 into a harness run over every test file in the repository, so "three of seven arrive broken" becomes a count.
