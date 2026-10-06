# Line: from a request to a check

Stage: survey done, formulate next · Opened: 6 October 2026 · Close or continue when: the map of real requests shows what share each kind of check would cover. If nearly all real requests fall under "an existing check already fails" or "only the requester can say", there is no method to study and the line closes with that as its finding.

## The product need

Line 1 in [PROGRAMME.md](../../PROGRAMME.md). Delegation pays only if saying what "done" means costs much less than doing the work. If this line succeeds, a person handing over a change spends minutes, not hours, agreeing a check, and knows how far to trust its verdict.

## The problem, stated precisely

Draft, to be fixed in the formulate session.

A **check** for a request is anything that takes a candidate change and returns accept or reject without the requester reading the code. It has three properties:

- **False accept:** the share of wrong changes it accepts.
- **False reject:** the share of right changes it rejects.
- **Requester cost:** what the requester had to do to obtain it and trust it.

A check has two parts with different jobs: a part that is red on the starting code and must go green (the change happened), and a part that is green and must stay green (nothing broke). A check with only the second part cannot tell a finished change from no change.

The line asks, for real requests: which kind of check could decide each one, in what proportions, and for requests with no ready check, which way of getting one has the best three numbers.

Out of scope: judging outcomes no test can express (parked), ranking several candidate solutions (parked), and whether the recipient can do the work at all.

## Where the field is

Called the test oracle problem, fail-to-pass testing, patch plausibility versus correctness, reproduction-test generation and intent formalisation. Hand-written tests from the original developers pass some wrong solutions on the best-studied benchmark (estimates from about 1% to 20% by method) and can reject valid ones (61% of a random sample flagged as at risk; rarely observed directly). Models now write a test that goes red-to-green on the known fix for about 63% of Python bug reports, which is not yet a trustworthy check, and generated tests tend to encode current behaviour. Asking the requester to confirm generated tests has one small favourable study and older unfavourable ones. Most real pull requests carry no test, and benchmarks exclude exactly those. Detail in [related-work.md](related-work.md).

## Metric and benchmark

Not built yet. The first instrument is the map: a fixed sample of real requests, each labelled with the cheapest kind of check that could decide it, labelled twice independently so agreement can be reported.

## Baselines

None yet. When methods are compared: the simplest is "existing tests only"; the best published are a generated fail-to-pass test (e-Otter++ style) and requester-confirmed tests (TiCoder style). Read Liang et al. (arXiv:2609.12012) before fixing this list.

## Current best answer

After the sceptic's review (`sceptic-survey.md`):

- The literature **shows** that passing tests is not the same as being right, even with developer-written tests. Wrong work accepted: shown, at a rate that depends on the method (about 1% to 20%). Right work rejected: shown to be possible and widely flagged, not measured as a rate. One benchmark family: Python libraries, agent-written patches.
- **Hypothesis, not a finding:** a model-drafted failing check that the requester confirms is a cheap, trustworthy route for new behaviour. The first draft said the literature suggests this; the sceptic showed it does not. There is no cost comparison, no error rate for confirmed checks, and older studies find people approve many wrong generated checks. It goes to the benchmark as one candidate among several.
- **Unknown:** what share of real requests each route covers, and what a generated check costs a requester on repository-sized work.

## Open threads

- R1 as a first data point: its outcome was "this section no longer appears in the output, everything else unchanged". Could that have been one command that is red on the base plus the existing suite as the stays-green part, in place of about 470 lines? Untested; worth settling on R1's recorded evidence before the map, because it is cheap and bears on R2.
- The recipient sees the Box's evaluator. Repair research says solvers overfit visible tests. The product already has owner-side checks; whether they differ enough from the visible ones to catch overfitting is unmeasured.
- Checkability may depend less on the task type (bug, feature) than on whether the outcome is observable at a command line. The map's labels should record both.
