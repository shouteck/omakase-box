# Outside sample 1: plan, written before any issue is read

Line: request-to-check · Date: 7 October 2026 · Rerun the fetch with `node lab/lines/request-to-check/map/sample-1/fetch.mjs` (results depend on the day it is run; the raw answers are kept).

Everything in this file is written and committed before the fetch runs.

## What is being asked

Three questions, on real requests nobody chose for convenience:

1. For what a real issue asks, where could a deciding check come from: the repository, the request's own text, a newly designed test, or only a person?
2. When an issue has been fixed, did the issue text written before the fix already determine what the fix's tests assert? This is the request-against-check question the CTO raised after R3b, and R3c will hide the test from the solver in some cases.
3. Can two labellers who have not seen each other's work agree on those, using guide version 1?

## The sample

**Repositories.** Four, named here before any of their issues is opened, picked by the lab lead for spread and nothing else: mid-sized, actively maintained, with their own test suites, in four languages and four kinds of software. Neither project the kitchen has already used.

| Repository | Language | Kind |
|---|---|---|
| `axios/axios` | JavaScript | HTTP client |
| `pallets/click` | Python | command-line library |
| `spf13/cobra` | Go | command-line library |
| `serde-rs/json` | Rust | data format library |

This is a hand-picked list of repositories. Only the choice of issues inside each is mechanical.

**Issues, per repository, by GitHub's search at the time of the fetch:**

- **Open:** the 5 most recently created open issues (`is:issue is:open`, newest first).
- **Fixed:** the 5 most recently created issues that are closed as completed and linked to a pull request (`is:issue is:closed reason:completed linked:pr`, newest first), keeping only those where GitHub reports a merged pull request that closes the issue. If the first 15 results do not yield 5, take what there is and record the shortfall.

No issue is skipped for being unclear, off-topic, a question or a duplicate. Those are data.

**Kept for each issue:** title, body, every comment with its author's role and time, labels, created and closed times. For fixed issues also: the closing pull request's number, title, creation time, the list of files it changed with their status, and the patch text of files whose path looks like a test (`test`, `tests`, `spec`, `__tests__`, `_test.` or `.test.` in the path). Long texts are cut at a stated length and marked.

**Mechanical facts, by script, no judgement:** for each fixed issue, whether the fix added test files, modified existing ones, or touched none.

## Method

1. One fresh agent splits each issue into conditions under the guide's unit rule, quoting the text. It sees no labels.
2. Two fresh agents label the same conditions with `GUIDE.md` version 1, each without sight of the other or of this plan's predictions.
3. `score.mjs` reports agreement per column.

The lab lead does not label. In the pilot the lead's readings leaned toward the tidier story three sessions running.

Also labelled, and reported separately, never mixed into the sample's counts: the three commander.js cases with a linked issue that the kitchen recorded in R3b-1, as known cases.

## Predictions

Written by the lab lead before the fetch.

1. Of the 40 issues, between 25% and 45% contain no request for a change at all (`NONE` throughout): questions, support, duplicates.
2. Among `RESULT` conditions with role `OUTCOME`: `REPO` in none or one; `REQUEST` in 30% to 50%; `NEW` in 30% to 50%; `PERSON` in 10% to 25%.
3. Of the fixed issues, 20% to 40% were fixed with no test change.
4. Of the fixed issues that have test changes, `determined` is `YES` for fewer than half, `PARTLY` for the largest group, `NO` for at least one in ten.
5. Agreement: Cohen's kappa at or above 0.6 on `source` among conditions both labellers call `RESULT`; lower, about 0.4 to 0.6, on `determined`, because it is the most judgemental column.

## What each outcome would mean

- **If `REQUEST` is common among outcomes** (prediction 2 holds or is exceeded): the reporter's own reproduction is a real route to a cheap check, worth testing as a method. If it is rare, that hypothesis from session 4 is in trouble.
- **If `determined` is mostly `PARTLY` or `NO`:** hiding the maintainers' test from a solver, as R3c plans, will often mark a reasonable answer wrong. R3c's hidden-test cases would then need a way to tell "wrong" from "different but acceptable", and the product could not treat a maintainer-style test as the last word.
- **If `determined` is mostly `YES`:** the R3b-1 observation (2 of 3 disagree) was bad luck or particular to that project.
- **If kappa on `determined` is below 0.4:** the question as worded cannot be answered reliably by reading, and the count above means little. That is a finding about the instrument.
- **Tells us nothing about:** rates in general. Forty issues from four hand-picked repositories, one day, two labellers of one model family.

## Cost and coordination

Zero cost: public issue data read through the GitHub API with the host's existing sign-in; nothing is posted or changed there. Light work: no installs, builds or test runs, so the kitchen need not be idle.

---
