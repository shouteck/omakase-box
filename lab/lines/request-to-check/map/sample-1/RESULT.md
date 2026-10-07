# Outside sample 1: result

7 October 2026, session 5. Plan and predictions: [PLAN.md](PLAN.md), committed before the fetch (`4c7ae9a`). Rerun the scoring with `node lab/lines/request-to-check/map/sample-1/score.mjs labels-a.csv labels-b.csv`.

## What was done, and what departed from the plan

- **Fetched as planned:** 40 issues, 5 open and 5 fixed from each of `axios/axios`, `pallets/click`, `spf13/cobra` and `serde-rs/json`, no shortfall. Raw answers in `raw/`, what labellers read in `issues/`, the queries and time in `fetch-record.json`.
- **Split** by one fresh agent into 78 conditions, plus one test question for each of the 20 fixed issues.
- **Labelled** by two fresh agents with guide version 1, neither seeing the other, the plan or any result. The lab lead labelled nothing.
- **Known cases, kept apart:** the three commander.js issues from the kitchen's R3b-1, fetched again by the lab with their comments (the kitchen had not saved them): 6 conditions, 3 test questions.
- **Departures:** four texts were cut at the stated lengths, including two test diffs (`axios-11192`, `axios-11262`) and one diff not shown at all. One fix (`click-3740`) was opened a minute before its issue was filed, so no request text predates it. Labeller A said it labelled most open issues from the split conditions without opening the issue file.

## Agreement

| Column | Cases | Raw agreement | Cohen's kappa |
|---|---|---|---|
| What the condition is about | 78 | 98.7% | 0.96 |
| Where a check could come from | 63 both call a result | 96.8% | 0.95 |
| Outcome or guard | 63 | 98.4% | 0.93 |
| Seen from outside the code | 63 | 93.7% | 0.68 |
| Did the text determine the fix's tests | 20 | 100% | 1.00 |

**Read this table with care.** Both labellers are the same model family reading the same guide and the same pre-split conditions. Agreement this high shows the guide can be followed the same way twice by this kind of reader. It does not show the labels are right, and it is far above what the plan predicted for the last column (0.4 to 0.6), which is a reason for suspicion, not comfort. The pilot's 0.71 was between the guide's author and a fresh reader; this is between two fresh readers of one kind.

## Counts

Where the two labellers differ, both figures are given.

**What the issues ask for (40 issues).**

- No request for a change at all: 1 of 40.
- At least one thing that should become true (an outcome): 37 of 40.
- Conditions asking for something to be written down (documentation, changelog): 11 of 78.

**Where a deciding check could come from, for the 54 outcome conditions both labellers agree are outcomes.**

| Source | Labeller A | Labeller B |
|---|---|---|
| Already in the repository, named by the text | 0 | 0 |
| In the request's own text (input and wanted result both given) | 21 | 20 |
| Has to be designed | 20 | 22 |
| Only a person can decide | 13 | 12 |

By issue: of the 37 issues with an outcome, 18 or 19 have at least one outcome whose check is in the request's own text. Open issues: 7 or 8 of 18. Fixed issues: 11 of 19.

By repository the mix differs a lot: in axios most outcomes carry their own check (10 of 13 by labeller A); in click most do not (4 of 19).

**Guards.** Ten conditions ask that something keep working. None names an existing test. Both labellers say the commonest one, "do not break anything else", has no honest label in this guide.

**Did the issue text determine what the fix's tests assert (20 fixed issues)?**

| | Count |
|---|---|
| The fix changed no test | 12 |
| Yes | 2 |
| Partly: the tests assert specifics the text does not give | 6 |
| No: the tests assert something else | 0 |

By script, 10 of the 20 fixes touched no file whose path looks like a test. Two more touched only a lock file or manifest under a `tests/` folder, which the labellers counted as no test. All five serde-json fixes are in the "no test" group; in Rust a test can live inside a source file, and the script and the labellers saw only paths and the patches of test-path files, so that five may be overcounted.

The known commander.js cases, apart: partly, partly, yes. The two "partly" are the two where the kitchen's pass read that the fix the issue suggests fails the maintainers' test.

## Against the predictions

| Prediction | Result | Held? |
|---|---|---|
| 1. 25% to 45% of issues ask for no change | 1 of 40 | **No.** Far fewer. |
| 2. Outcomes: repository none or one; request text 30 to 50%; designed 30 to 50%; person 10 to 25% | 0; 37 to 39%; 37 to 41%; 22 to 24% | Yes |
| 3. 20% to 40% of fixes change no test | 12 of 20 (10 by script) | **No.** More. |
| 4. Of fixes with tests: yes under half, partly the largest, no at least one in ten | 2 yes, 6 partly, 0 no, of 8 | Mostly; no "no" was found |
| 5. Kappa at least 0.6 on source; 0.4 to 0.6 on determined | 0.95; 1.00 | Higher than predicted on both |

## What it supports

- **Suggests** (54 outcome conditions, four hand-picked repositories, one day): a check already sitting in the repository and named by the requester is essentially never what a real issue offers. This is the third look that finds none (0 of 5 in zod, by the kitchen; about one in ten in our own briefs, mostly guards).
- **Suggests:** in a little over a third of outcome conditions, and about half of issues, the reporter's own text contains both an input and the wanted result. That is the "reporter's reproduction as the check" hypothesis from session 4 with a first count behind it. It says the material is there; nobody has yet turned one into a declared command and run it.
- **Suggests:** more than half of merged fixes for real issues change no test. Where that holds, a replay benchmark built from "issues whose fix came with a test" is drawn from the minority, and an owner who expects the repository's maintainers to have a test for the change will usually be wrong.
- **Suggests** (8 fixes with tests in the sample, 3 known cases): when a fix does come with tests, those tests usually assert more than the issue said: 6 of 8 in the sample, 2 of 3 in the known cases. Not one was labelled as contradicting the issue. "Partly" does not mean a solver who follows the issue would fail the test; whether they would is an experiment nobody has run.
- **Does not show:** any rate for issues in general; that labels are correct; anything about how often a text-following answer fails a hidden test.

## What the labellers said is wrong with guide version 1

From `labeller-a-notes.md` and `labeller-b-notes.md`; both made the first three points independently.

1. "Test file" is decided by path. Lock files and manifests under `tests/` assert nothing. The question is about assertions.
2. The tie-break "take the cheaper" only makes sense for the source column. Applied to the others it pushes doubtful cases one way.
3. "Do not break anything" has no source. Housekeeping (dependency removals, version strings, release steps) fits none of the four kinds.
4. One answer per request on `determined` hides the case where the central assertion was determined and the extras were not.
5. `PERSON` mixes "the text offers two alternatives" with "no mechanical check is possible".
6. "Seen from outside" is undefined for manifests, configuration and type annotations; this is where agreement was lowest.
7. Literal edit requests ("remove X from file Y") contain no code, yet the check is a one-line search.

## Sceptic

Pending.
