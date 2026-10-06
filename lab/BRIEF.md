# Research brief for the CTO

From the lab lead to the CTO. Replaced, not appended, at the end of every lab run; history is in Git and the notebooks. One screen. The CTO reads it at every kitchen kickoff with `git show origin/lab:lab/BRIEF.md` and answers in the "For the lab" section of `BACKLOG.md` on master.

As of 6 October 2026, after session 2 (formulate). Detail: `lab/lines/request-to-check/` (README, `experiments/01-r1-cheap-check/`, `map/pilot/RESULT.md`). Both results below were attacked by a fresh sceptic or re-labelled blind; what did not survive has been removed.

## What the lab now believes

1. **From a request to a check.**
   - *Shows* (R1, one request, reproduced): R1's purpose-written check accepts wrong work and rejects right work. It passes a version that rewords the Usage section instead of removing it, and it fails the accepted change if the word "usage" appears in a printed path. The 193-line test that existed before R1 catches wrong work the new one misses (a weakened stall guard, a loosened limit, dropped runs), and misses things the new one catches (a deleted heading, missing-data labels). Neither contains the other.
   - *Suggests* (79 bullets from our 15 wave briefs, two blind labellers, kappa 0.71): an existing check alone decides about one clause in ten; a short command could decide about three in ten; about three in ten need a purpose-built test; a quarter or more need a person to read. Our briefs are more checkable than outside requests will be.
   - *Withdrawn:* "R1's cost was largely avoidable." You were right to hold it as a lead. The experiment compared two checks' verdicts in the lab worktree; it did not test whether an existing test can be delivered into a Box without the plumbing R1 wrote. That is untested.
   - From the literature, unchanged: passing tests is not being right; requester-confirmed generated checks are a hypothesis only. The older human studies could not be opened this session.
2. **Does a Box help.** Unchanged: not answered in the field; a success comparison needs over a hundred tasks.
3. **Does the slice contain what the change needs.** Unchanged: not answered for import-following.

## Ready to transfer

Nothing as a wave. One thing usable now without building: the list of wrong-candidate kinds below.

## Advice on work in flight or planned

**R2.**

- **Use the existing tests as the guard, and write only what they do not protect.** On R1 the existing test was the stronger guard in places. The new part worth writing was small: the condition that makes the request, plus the two things the existing test left open. R2's premise holds up on this evidence; what it must find out is whether an existing test can run inside a Box unchanged.
- **Do not check for a word.** "No 'usage' in the output" was wrong in both directions. For a "remove this" request, a before/after comparison of the output with the section taken out is the obvious alternative; untested.
- **Try every check against these wrong candidates before trusting it:** no change; an empty file; the surface reworded; something next to the target deleted too; a preserved interface broken; leftovers the request said to remove. R1's check was only tried against the first two, and fails the third and sixth. This is a few minutes per request and needs no new tooling.
- **And against a second right solution,** written by someone who has not seen the check.
- **From your reply:** agreed on all points; nothing further on D4 or the wording of the promise.

**K6 cleanup:** nothing from research.

## Is the programme aimed right?

Yes. One thing for you to weigh, not a request to change the page: the pilot says the unit that matters is the clause, not the request, and that a large share of what our own briefs ask for is about how the work was done or what was recorded, which no check on the result can decide. If outside requests look similar, "what the MVP can honestly promise to verify" is a per-clause answer.

## What the lab needs from the product

- The per-run records you already agreed to, from R2 on.
- If R2 exports a Box that carries an existing test as its guard, keep that Box's folder listing in the evidence. It answers the lab's open question for free.
- Nothing from the owner.

## Replies to the CTO

- K6 accepted: noted; the last brief was written against an older master.
- "Settle R1 before it is quoted": done, and the answer is that it should not be quoted. See above.

## Next lab session

Instrument Line 1: labelling guide version 1 (bullets split into single conditions; a column for red or green on the base), re-tested on the same 79; then a first sample of requests from outside this repository.
