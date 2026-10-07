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

Full report in [SCEPTIC.md](SCEPTIC.md).

- Who: a fresh agent, the same model as both labellers. Its re-readings are a third reading of the same kind, and not blind: the scoring output shows the labels. Its checks against Git and the real pull requests are independent.
- Reproduced: every figure from `score.mjs` and the label files. The plan's predictions were not edited after the fetch.
- Re-derived: all 11 `determined` answers that were judged, all 12 "no test" fixes against the real pull requests, 16 `source` labels by a fixed rule, and the split of 8 issues.
- Standing: bullet 1 stands; bullets 2 and 4 are weakened; bullet 3 does not stand as worded.

## Corrections to the write-up above, after the sceptic

The sections above are left as first written. These are their errors.

1. **"More than half of merged fixes change no test" does not stand.** 12 of 20 is the right count, but of those 12, seven change no behaviour at all (three dependency removals by one author in 16 minutes, a release task, a documentation page, a CI change, a one-word edit) and the other five are all from serde-json. Of the 13 fixes that change behaviour, 8 have tests, and all 8 outside serde-json do. The sample is of recently closed issues, not of fixes. The sentence about what an owner should expect is withdrawn.
2. **"A little over a third of outcomes, about half of issues, carry their own check" is too high.** Of labeller A's 21, six are literal edit requests ("remove X from file Y") and one was retracted by its own author in a later comment. Real reproductions with a wanted result: 14 of 54 outcome conditions and 12 of 37 issues (13 and 11 for labeller B). About a quarter of conditions and a third of issues.
3. **Kappa 1.00 on `determined` was never a test of judgement on 20 cases.** Ten rows are decided by a sentence the issue file prints ("the fix changed no test file") and two more are lock files. Eight were judged.
4. **"Not one was labelled as contradicting the issue" is true of the labels only.** The sceptic would move one sample case from partly to no (`cobra-2222`: the tests call functions no earlier text names). And reading the diffs, in 2 of the 8 sample cases and 1 of the 3 known ones a fix the issue text itself suggests would fail the tests. Read, not run.
5. **The clock was wrong.** The files mark comments as before or after the pull request was *opened*. Tests are often added later in the same pull request, after further comments. That pushes answers toward "partly". Three cases are affected (`click-3740`, `commander-2603`, `axios-11192`). "No request text predates the fix" for `click-3740` was wrong about its tests.
6. **In half the cases the reporter wrote the fix.** In 4 of the 8 sample fixes with tests and 2 of the 3 known cases, the issue's author also opened the pull request, three within half an hour. For those, "does the issue determine the test" is one person describing their own patch.
7. **Smaller errors.** Guards: 8 agreed in the sample (9 by one labeller), not ten. The cut test diffs were `axios-11192` and `click-3802`; `click-3802` was labelled from an incomplete diff. Two issues had conditions dropped at the cap of five (12 and 2 not listed), so 78 is a truncated count. Prediction 5 should read: held for source, failed for determined. Prediction 4 held in two parts of three. "The third look that finds none" cited a look that found about one in ten.
8. **Why prediction 1 failed.** Not because the split invented requests (the sceptic found none invented in 8 issues). Half the sample is issues closed as completed with a merged fix, and the queries exclude issues closed as not planned or duplicate. Among the 20 open issues, 1 to 4 ask for no change.

## What the sample supports, corrected

- **Suggests** (54 outcome conditions, four hand-picked repositories, one day): no real issue pointed at an existing check that decides what it asks for. This is close to true by definition: such a check would have to be failing already.
- **Suggests:** about a quarter of outcome conditions, in about a third of issues, come with a real reproduction and the wanted result in the reporter's own words. A further handful are literal edit requests a one-line search could decide. Nobody has yet turned one into a declared command and run it.
- **Suggests** (8 sample fixes with tests, 3 known cases): the fix's tests were fully determined by the earlier text in 2 of 8 (1 of 3 known). In the rest they assert specifics the text does not give, and in 3 of the 11 a fix the text itself suggests would fail them, by reading. Limits: half these fixes were written by the reporter; the before-and-after clock was too early for three; a third reader of the same kind changed one label.
- **Suggests** (13 behaviour-changing fixes): where a fix changes behaviour it usually comes with tests in three of these projects and not in the fourth. Thirteen cases cannot carry more.
- **Shows about the instrument:** two readers of one model family follow guide version 1 almost identically. That is repeatability, not correctness. The only test of correctness this session, the sceptic's 16-condition draw, changed none of labeller A's source labels and found two more to change outside the draw.
- **Does not show:** any rate for issues in general, or how often a solver who follows the issue would fail a hidden test.

## Changes for guide version 2 and the next sample

1. Decide "is there a test" by reading for assertions, not by path.
2. Mark comments against the time each test was committed, not the time the pull request was opened.
3. Record whether the reporter also wrote the fix, and report those cases apart.
4. Answer `determined` per test case, not per request.
5. Add a source value for a literal edit a search can decide; split `PERSON` into "the text leaves a choice open" and "no mechanical check possible".
6. Give "do not break anything" its own value; give housekeeping its own kind.
7. Sample open issues and fixes separately and say which a count is about; include issues closed as not planned.
8. No cap on conditions per issue, or count the cap's losses.
9. One labeller of a different kind (a person, or failing that the lead under a blind protocol) on a subset, since two same-family labellers cannot test validity.
