# Gate 1b: Sceptic

8 October 2026. Review of the draft [gate-1b-result.md](gate-1b-result.md) against the [plan](gate-1b-plan.md) (commit `ba544f5`).

**Host and model.** Claude Code subagent on the owner's Windows 10 machine, model Opus 5.5 (`claude-opus-5-5`), fresh context, no access to the researcher's conversation. As far as I know this is the same model family as the researcher. No diversity of model is claimed. Nothing paid was used.

## Standing

| Claim | Standing |
|---|---|
| Verdict "worth going on, by the rule fixed in advance" | **Stands by the letter of the rule. Weaken to "suggests"** for what it means: see findings 1 to 4. |
| 29 of 30 scoreable | Stands |
| Error trace names the fix on 6 of 29 | Stands |
| Fix in the narrow Box on 28 of 29 | **Weaken**: 26 where a changed function ran; 2 are file-target tasks where the changed lines are in no Box function (finding 5) |
| Subtraction keeps the fix on 9 of 27, left out | Stands |
| 23 / 20 / 14 / 0 | Stands as arithmetic; 14 of 20 depends on taking the median over all mechanical words (finding 1) |
| "Pulling the image took one to four minutes per task" | **Does not stand** (finding 7) |

## What I reran

1. `check.py`: passed.
2. `measure.py` on `sympy__sympy-16597`, `django__django-13786`, `matplotlib__matplotlib-26113`. Every field of the three `measurement.json` files and of `sample-rerun.json` equals the earlier files and `summary.json`, except the two host timings.
3. Headline counts recomputed from the 30 `measurement.json` files with my own script, not `decide`: 29 scoreable, 6 named, 28 in Box, 9 of 27, T 23, W 20, clearly fewer 14, costly 0, sums 4,289.5 and 2,121, largest ratio among the other six 1.008, 15 of 29 under 5%, median 433 functions. All match.
4. A second, independently written matcher (own word search, own Box membership from the raw traces) reproduced `ordinary_first` and `narrow_first` for every word of every scoreable task, and the Box size of every task.
5. One fresh container run of `scikit-learn__scikit-learn-14087` from a temporary copy (`lab-gate-1b-sceptic-run1`), kitchen idle, network none. Both traces are identical to the recorded ones, key for key and in call order (569 and 788 entries). The measurement is identical apart from times (plain 2.45 s against 2.0; traced 3.56 against 2.31; neighbours 24.46 against 24.64). Temporary directory removed, no container left, image kept.

## Sensitivities, all outside the plan

Same decision rule, same T and W construction, computed by me after seeing the result. "Verdict" is what the plan's rule would say.

| Variant | W | Clearly fewer | Costly | Sum of places: baseline, Box-first | Verdict |
|---|---|---|---|---|---|
| Plan as run | 20 | 14 | 0 | 4,290; 2,121 | worth going on |
| (a) Ordinary search over production files only | 20 | 13 | 0 | 2,275; 871 | holds |
| (b) Issue words only | 19 | 13 | 0 | 6,676; 3,895 | holds |
| (a+b) Issue words, production files only | 19 | 12 | 0 | 3,274; 1,438 | holds |
| (c) Each task's best ordinary word, and that word's Box cost | 20 | 8 | 0 | 511; 404 | **stop** |
| (c) Each side picks its own best word | 20 | 9 | 0 | 511; 128 | **stop** |
| (c) Same, production files only | 20 | 8 | 0 | 384; 127 | **stop** |
| (d) Box matches in first-call order, against ordinary | 20 | 13 | 0 | 4,290; 2,185 | holds |
| (d) Same, against production-only search | 20 | 12 | 1 | 2,275; 935 | stop, by one costly task |
| Rival: search only files the test ran (no functions), against ordinary | 20 | 12 | 0 | 4,290; 2,384 | **the rival also passes** |
| Box against that file filter as the baseline | 20 | 11 | 2 | 470; 301 | stop |
| Rival: production files of the test's own package (15 tasks have one; 8 in W) | 8 | 6 | 0 | 874; 141 | the rival passes on those |

## Findings

1. **The verdict rests on the median over mechanical words, and flips with a sensible word.** Of the 86 word-and-task pairs that "reach the fix" in W, 31 do so only after more than 100 places: words such as `time`, `shape`, `array`, `args`, `random`, `append` that happen to occur inside the changed function. Nobody finds a fix by reading 2,733 matches of `shape`. They inflate the ordinary median and the Box shrinks them most. With each task's best word, ordinary search reaches the fix in 10 places or fewer on 13 of 20 tasks (first place on 7), only 3 or 4 tasks save 20 places or more, and the plan's own rule says stop. The page reports the best-word medians (6 and 1) but not that the rule fails on them.
2. **The word rule also hides the easiest route.** A class name is not "inside a changed function", so `AutocompleteJsonView` (Django 14752) and `HPacker`, `offsetbox` (Matplotlib 24570) count as not reaching. Measured at file level, the best issue word puts a patched file within a median of 5 places by ordinary search (4 without tests) on all 23 tasks of T, including the three Matplotlib tasks reported as having no word.
3. **A plain "files the test ran" filter passes the same rule** (12 of 20, none costly), and it contained the patched file on 29 of 29, one better than the Box. The function-level Box is better than it in total (301 against 470 places) but not by the plan's standard. Path order also favours any filter: the ordinary count depends on where the fix's file falls alphabetically.
4. **The gain is concentrated.** Ordinary median is 10 or less on 6 of 20 tasks; 11 of 20 save 20 places or more. The sum 4,290 is 42% one task (SymPy 16597), where the Box does not help. The page says most of this; the opening paragraph does not.
5. **Truth mapping, by hand on four tasks.** Django 13786 (`CreateModel.reduce`) and scikit-learn 14087 (`LogisticRegressionCV.fit`): target correct and present in the failing trace. SymPy 22914 (file target): the fix adds two entries to a module-level dictionary in `pycode.py`; "in Box" means only that some function of that file ran. The lines to change are in no Box function. SymPy 16597: the six listed functions are correct and none was called, but the patch also changes module-level rules in `sympy/core/assumptions.py`, which is what the three named tests exercise. The target rule drops module-level lines once any function is touched, and the Box cannot hold module-level code. The page's "six functions changed, none of them run" omits this. All targets in full: 26 of 29.
6. **A cheaper cut than neighbour subtraction was not tried.** Keeping only functions first called after the named test function starts gives a median of 49 functions (0 to 648) and keeps the fix on 25 of 29, with 13 of 20 clearly fewer and none costly against production-only search. This is my own construction after seeing results and is unreviewed; it weakens the page's implication that only heavy techniques remain.
7. **Time.** `pull_seconds` over 29 attempts: 1 to 546 seconds, median 37, four above four minutes (all Matplotlib, up to nine), 48 minutes in total. "One to four minutes per task" is wrong. The run and host timings are as stated.
8. **Corrections.** The parser fix admitted Astropy 7166, which then counted as clearly fewer; the kept earlier summary gives 28 scoreable, 13 of 19, same verdict. The reordering of `decide` cannot change this verdict (S is 29, W is 20). Both are disclosed and the verdict holds without them. "Recorded before the result was read in full" cannot be checked from the files. The SymPy admission test also accepts "any test failed"; on all five SymPy tasks a named test did fail, so nothing changed.
9. **Hygiene.** Every captured attempt has `--network none`; Django 16116 never created a container. No containers are running. The result page and the `gate-1b` folder are untracked in Git; only the plan is committed.

## What survives

The instrument is reproducible and honest to its plan. A traced run of the failing test costs seconds, and the changed function is almost always among what ran while the error trace rarely names it. That much is solid. What is not shown is that a Box beats what a competent searcher already does: a good word, production files, or a file-level filter. "Worth going on" is fair only as "nothing here says stop"; it is not evidence that the Box helps an agent.

## Corrections for the result page

1. Opening paragraph: add that with each task's best word the rule fails (8 or 9 of 20), and that ordinary search then reaches the fix within 10 places on 13 of 20 tasks.
2. Report the sensitivities above: production-only (13 of 20), issue words only (13 of 19), and the files-the-test-ran filter (12 of 20, patched file present on 29 of 29).
3. "28 of 29" becomes "26 of 29 with a changed function in the Box, plus 2 file-target tasks where only the file is represented"; add that all targets are present on 26.
4. SymPy 16597: say the patch also changes module-level rules in `sympy/core/assumptions.py`, that the target rule ignores them, and that the Box as defined cannot contain module-level code.
5. Replace the pull-time sentence with: 1 to 546 seconds, median 37, 48 minutes in total.
6. Limits: add that "reaching" by a generic word (31 of 86 beyond 100 places) is not finding, that class names do not count as reaching, and that path order favours any filter.
7. Say "suggests" rather than implying a demonstrated advantage; state that the next step must compare against production-only search with a good word and against the file-level filter, not against the "ordinary" column.
8. Replace "both recorded before the result was read in full" with what the files show, or drop it.
9. Commit the result and the `gate-1b` folder; they are untracked.
