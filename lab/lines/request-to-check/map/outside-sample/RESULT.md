# Outside sample: five issues from a repository that is not ours

6 October 2026, session 4. Labels in `labels-researcher.csv`, clauses in `clauses.md`.

## What this is, and what it is not

- **Five clauses.** One per open issue of `colinhacks/zod` that the kitchen's R3 cook listed as a candidate. They are the lab's first requests from outside this repository.
- **One labeller,** the session 4 researcher, using guide version 0 with the faults the pilot found. No second labeller, so no agreement figure.
- **Labelled from one-line summaries.** The kitchen did not keep the issue texts or a transcript of its queries. The lab fetched nothing. The unit the guide asks for is the condition "as the requester wrote it"; what was labelled is a cook's paraphrase of it.
- **Not a sample of anything.** How the cook chose these five is not recorded. All five are bug reports against a validation library with a large test suite, filed within two weeks of each other, and each was picked as a possible bounded fix. That is the most checkable kind of request there is. There are no feature requests, questions, documentation or design issues among them.
- **No predictions were written first.** The candidates had to be read for the reconciliation before they were labelled.
- **None of the five defects was reproduced.** The kitchen ran existing checks and found none failing; it did not run anything that shows the reported behaviour on the pinned commit. That each is a real defect at `0b216ef` rests on the issue text alone.

Counts only. Five cases give no rate.

## Labels

| Id | What is being asked | Label | Seen from outside | One line of reasoning |
|---|---|---|---|---|
| Z6637 | A given expression must compile without error TS5115 under a compiler nightly | `EXAMPLE` | y | The record gives the input and the expected result; a one-line file and one compiler run compare them. Doubt: it needs a compiler the repository does not pin, and version 0 does not say how much set-up a cheap label tolerates. |
| Z6639 | A given parse of `NaN` must succeed, not throw | `EXAMPLE` | y | The record quotes a one-expression reproduction; the expected result is implied. One expression and its result decide it. |
| Z6641 | `z.record` must run the key schema on an own `__proto__` key | `NEW-TEST` | y | Deciding it needs a constructed, hostile input and a key schema built to reject it. No reproduction is recorded; if the issue has one, this is `EXAMPLE`. |
| Z6621 | Every non-English locale must keep `Infinity` and `-Infinity` in one family of messages | `NEW-TEST` | y | A claim over all locales; rule 1 gives the dearest part, a purpose-built test that walks them. Expected wording per locale is not recorded. |
| Z6648 | `toJSONSchema` must emit only standard `format` values | not labelled | y | Too thin. If the issue names the values and what replaces them, a new test decides it; if someone has to decide what "standard" means here, a person does. |

## Counts

| Kind of check | Count of 5 |
|---|---|
| `EXISTING` | 0 |
| `COMMAND` | 0 |
| `EXAMPLE` | 2 |
| `MEASURE` | 0 |
| `NEW-TEST` | 2 |
| `READ` | 0 |
| Could not be labelled | 1 |

Seen from outside the code: 5 of 5.

Two of the four labels (Z6637, Z6641) could move by one step with the issue text in hand. Only Z6639 and Z6621 are labels the researcher would defend from the record as it stands.

## Three facts the guide has no column for

Recorded here because they are what the kitchen's R3 actually turned on.

| Id | An existing check fails on the base (kitchen's finding) | What that finding rests on | The record quotes a reproduction | An existing check asserts the behaviour to be changed |
|---|---|---|---|---|
| Z6637 | no | `tsc` under the nightly printed no diagnostics; exit code not captured | yes | not recorded |
| Z6639 | no | the suite was reported green by the runner; exit markers retracted; nothing aimed at NaN was run | yes | not recorded |
| Z6641 | no | stated ("latent; needs new test"); no run or search recorded | no | not recorded |
| Z6621 | no | a search of locale tests, no transcript kept | no | not recorded |
| Z6648 | no | stated; no run recorded | no | likely, by the cook's reading |

- Existing failing check: 0 of 5. The evidence behind each "no" is weak: none has a captured exit code aimed at the defect, and for two there is no record that anything was run.
- The record quotes a reproduction: 2 of 5. For the other three the record is silent; it does not say the issue lacks one.
- An existing check likely conflicts with the fix: 1 of 5, as a guess by the cook.

## What it says about the lab's map

1. **The map's cheapest label was empty.** `EXISTING` means a check already in the repository decides the clause. R3's rule was narrower still: an existing check that fails on the base. Zero of five met it. In the pilot on our own briefs `EXISTING` was 5 to 8 of 79; the guide's own example wording for that label ("the suite still exits 0") describes a guard, and the pilot did not count how many were outcome checks.
2. **The pilot's missing column is the one that mattered.** Version 0 does not record whether a condition is red or green on the base. This repository had thousands of passing tests at the pin by the worker's logs (the reviewer reproduced one file of 54 tests): guards were plentiful and free. What was missing in every case was the outcome check. This is **consistent with** a structural reading, which is reasoning and not a finding: where a project keeps its tests green, an open bug with a failing test already in the tree should be rare by construction. Five cases cannot show "rare".
3. **Where a check comes from is a different question from what kind it is.** For two of five the check's input was in the request itself. R3's rule ("no request-specific test") ruled those out together with tests that would have had to be designed. Under the neutral format both `EXAMPLE` cases would be one declared command; whether a reporter's expression copied into a command is "code written for that request" is a product definition, not a research result.
4. **One candidate shows the opposite hazard.** For Z6648 the cook expected existing tests to assert the behaviour the issue wants changed. A guard like that is green on the base and red after a right change. Version 0 cannot record it. The literature's "tests encode current behaviour" is this, seen from the request's side.
5. **`COMMAND` and `EXAMPLE` blur under the neutral format.** Version 0 separates "a short command" from "inputs and expected result given". When every check is a declared command, an example is a command. The distinction worth keeping is the source column in point 3 and the cost in lines.

## Changes this adds to guide version 1

On top of the six in `../pilot/RESULT.md`:

7. A column for the **source** of the check: already in the repository; in the request's own text; must be written new; a person.
8. A column for **conflict**: an existing check asserts the behaviour the request wants changed (yes, no, unknown).
9. A rule for **set-up**: say whether a tool the repository does not already use (a compiler nightly, a second version to compare with) keeps a cheap label or moves the clause to `NEW-TEST`. The second labeller's note 7 in the pilot asked for the same.
10. Label from the **request's own text**. A summary written by someone screening for one property loses what the labels depend on. When the kitchen surveys issues, the lab needs the text kept, or the lab must fetch it itself.
