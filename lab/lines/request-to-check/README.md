# Line: from a request to a check

Stage: formulated (session 2); instrument next · Opened: 6 October 2026 · Close or continue when: the map of real requests shows what share each kind of check would cover. If nearly all real requests fall under "an existing check already fails" or "only the requester can say", there is no method to study and the line closes with that as its finding.

## The product need

Line 1 in [PROGRAMME.md](../../PROGRAMME.md). Delegation pays only if saying what "done" means costs much less than doing the work. If this line succeeds, a person handing over a change spends minutes, not hours, agreeing a check, and knows how far to trust its verdict.

## The problem, stated precisely

Fixed in session 2. Change it only with a notebook entry saying why.

**Terms.**

- A **request** is a piece of text plus the commit it applies to (the base).
- A **clause** is one acceptance condition in a request. Requests are compound; the clause, not the request, is what a check decides. A request is checkable only as far as its clauses are.
- A **candidate** is any change applied to the base. It is **right** if a requester who read and ran it with full understanding would accept it, and **wrong** otherwise. In a benchmark, right and wrong are fixed by construction: the change that was actually accepted is right, and each wrong candidate is made by a named kind of damage.
- A **check** takes a candidate and returns accept or reject without the requester reading the candidate's code. It has two parts with different jobs: **evidence of change**, which is red on the base and must go green, and a **guard**, which is green on the base and must stay green. A check with no evidence of change cannot tell a finished change from no change.
- A **route** is a way of getting a check for a request: name an existing one, write a command, write a test, have a model draft one and the requester confirm it, and so on.

**What is measured, for a check on a request.**

- **Wrong work accepted:** of a fixed set of wrong candidates, the share it accepts. The set always contains at least: no change; an empty or deleted target; the surface reworded without the substance changed; something next to the target deleted as well; a preserved interface broken; the right result with leftovers the request said to remove. (These six came out of experiment 01 and the repair literature. The list grows; it never shrinks.)
- **Right work rejected:** of a set of right candidates, the share it rejects. The set needs at least two right candidates that were produced independently of each other; one accepted change cannot show this.
- **Requester cost:** lines the requester had to write, items the requester had to read and confirm, and minutes where a run recorded them. Lines and items are countable from the record; minutes are missing unless measured, and are reported as missing.

**What a solution must do.** A route is better than the baseline (a purpose-written test, as in R1) on a request if its check costs the requester less and accepts no more wrong work and rejects no more right work on the same candidate sets. The line succeeds if some route does that on most clauses of real requests.

**What would show the formulation is wrong.** Two labellers cannot agree which kind of check decides a clause; or right and wrong candidates cannot be told apart by two people who read the request; or cost in lines and items does not track what a requester actually finds expensive.

Out of scope: judging outcomes no test can express (parked), ranking several candidate solutions (parked), and whether the recipient can do the work at all.

## Where the field is

Called the test oracle problem, fail-to-pass testing, patch plausibility versus correctness, reproduction-test generation and intent formalisation. Hand-written tests from the original developers pass some wrong solutions on the best-studied benchmark (estimates from about 1% to 20% by method) and can reject valid ones (61% of a random sample flagged as at risk; rarely observed directly). Models now write a test that goes red-to-green on the known fix for about 63% of Python bug reports, which is not yet a trustworthy check, and generated tests tend to encode current behaviour. Asking the requester to confirm generated tests has one small favourable study and older unfavourable ones. Most real pull requests carry no test, and benchmarks exclude exactly those. Detail in [related-work.md](related-work.md).

## Metric and benchmark

Two instruments, neither finished.

- **The map** (`map/`): real requests split into clauses, each labelled with the cheapest kind of check that could decide it. Guide version 0 was piloted on this repository's 79 wave-brief bullets with two blind labellers: 78.5% agreement, kappa 0.71. The pilot found the guide's faults (`map/pilot/RESULT.md`); version 1 is specified there and untested.
- **The candidate sets** (`experiments/01-r1-cheap-check/`): for one request so far (R1), 13 wrong and 4 right candidate changes with both checks' verdicts. This is the seed of the benchmark that scores a check for wrong work accepted and right work rejected. There is no held-out part yet: every candidate was written by someone who had read the checks.

## Baselines

None yet. When methods are compared: the simplest is "existing tests only"; the best published are a generated fail-to-pass test (e-Otter++ style) and requester-confirmed tests (TiCoder style). Read Liang et al. (arXiv:2609.12012) before fixing this list.

## Current best answer

From this repository, after two sceptic reviews:

- **Shows** (one request, reproduced by a fresh agent): R1's purpose-written check accepts wrong work and rejects right work, and the test that already existed catches wrong work it misses. Neither contains the other.
- **Suggests** (79 bullets, one author, one repository, guide with known faults): an existing check alone decides about one clause in ten of our own briefs; a short command could decide about three in ten; the rest need a purpose-built test or a person.
- **Not shown:** that R1's preparation cost was avoidable. The first survey floated this; the experiment did not test delivery into a Box.

From the literature, after the sceptic's review (`sceptic-survey.md`):

- The literature **shows** that passing tests is not the same as being right, even with developer-written tests. Wrong work accepted: shown, at a rate that depends on the method (about 1% to 20%). Right work rejected: shown to be possible and widely flagged, not measured as a rate. One benchmark family: Python libraries, agent-written patches.
- **Hypothesis, not a finding:** a model-drafted failing check that the requester confirms is a cheap, trustworthy route for new behaviour. The first draft said the literature suggests this; the sceptic showed it does not. There is no cost comparison, no error rate for confirmed checks, and older studies find people approve many wrong generated checks. It goes to the benchmark as one candidate among several.
- **Unknown:** what share of real requests each route covers, and what a generated check costs a requester on repository-sized work.

## Open threads

- Can an existing test be shipped into a Box and run there as a guard without request-specific plumbing? Experiment 01 ran in the lab worktree and could not say. This is the question that decides whether R1's cost was avoidable, and it is R2's question too.
- Checking for a word ("no usage in the output") both accepted a reworded section and rejected right work when the word appeared in a path. A before/after comparison of the output with the section removed was not tried and may be the better cheap check for "remove this" requests.
- Held-out candidates: wrong and right candidates must be written by an agent that has not seen the checks. In experiment 01 all 26 predictions by the two people who had read the checks came true.
- The recipient sees the Box's evaluator. Repair research says solvers overfit visible tests. The product already has owner-side checks; whether they differ enough from the visible ones to catch overfitting is unmeasured.
- Checkability may depend less on the task type (bug, feature) than on whether the outcome is observable at a command line. The map's labels should record both.
