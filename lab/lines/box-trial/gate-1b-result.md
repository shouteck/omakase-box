# Gate 1b: the Box as the first place to search

8 October 2026. The same 30 tasks as Gate 1, six large Python projects. Scripts only; no agent was run. [Plan fixed and pushed before any run](gate-1b-plan.md) (commit `ba544f5`); [instrument](gate-1b/README.md); [sceptic](gate-1b-sceptic.md). **This is the version after the sceptic**, who reran a sample and one container run (all matched) and tested fairer versions of ordinary search.

**WORTH GOING ON by the letter of the rule fixed in advance; the evidence *suggests* it, no more. With each task's single best search word the same rule would say stop.** Where the failing test's error trace does not already point at the fix and a search word can reach it at all (20 tasks), searching the Box first reached the fix in at most half as many places on 14 of them, and on the other 6 cost at most 1% more. The error trace named the fix on 6 of 29 tasks. A function the fix changed was in the narrow Box on 26 of 29, and on 2 more the Box held code from the patched file.

The weak point, from the sceptic: the pass depends on taking the median over mechanically chosen words. If an agent picks a good word, ordinary search already reaches the fix within 10 places on 13 of the 20 tasks, and only 8 or 9 of 20 show a clear gain, which the rule would call a stop. And a cruder filter, "search only the files the failing test ran", does nearly as well (12 of 20) and holds the patched file on all 29.

| Measurement | Observed |
|---|---|
| Tasks scoreable | 29 of 30 (Gate 1: 23) |
| Narrow Box, share of production source | 0.6% to 21.2%, median 4.7% (Gate 1's leanest form: 15% to 56%) |
| Narrow Box, number of functions | 31 to 1,515, median 433 |
| A function the real fix changed is in the narrow Box | 26 of 29; every changed function on those 26. On 2 more the fix changes no existing function and the Box holds code from the patched file |
| The error trace alone names a function the fix changed | 6 of 29 |
| After subtracting what passing neighbours ran, the fix is still there | 9 of 27 measured: left out of the search, as the plan requires |
| Tasks where the trace does not name the fix | 23 |
| ... of which some search word reaches the fix by ordinary search | 20 |
| ... Box-first reaches it in at most half the places | 14 of 20 |
| ... Box-first costs more than 1.2 times ordinary | 0 of 20 |
| Places to look through, summed over the 20 tasks' medians | ordinary 4,290; Box-first 2,121 |
| The same, leaving out the one task whose fix is not in the Box | ordinary 2,469; Box-first 286 |
| Using each task's single best word | ordinary median 6 places; Box-first median 1 |
| Seconds to run the failing test: plain, traced | median 1.6 and 2.2; worst 11.0 and 7.9 |
| Seconds on the host to parse the repository, and to build the Box from the trace | median 3.7, and 0.02 |

## The sceptic's sensitivities, outside the plan

Clearly fewer places with the Box first, of the tasks with a reaching word:

| Change to the comparison | Result | The rule would say |
|---|---|---|
| As planned | 14 of 20 | go on |
| Ordinary search skips test files | 13 of 20 | go on |
| Words from the issue only, none from the test output | 13 of 19 | go on |
| Each task's single best word | 8 or 9 of 20 | **stop** |
| Box matches in the order functions were first called | 13 of 20; one task becomes costly against test-free search | go on, or stop against test-free search |
| Rival filter: only files the failing test ran, no function detail | 12 of 20 | go on |

## Every task

"Ordinary median" and "Box-first median" are places to look through before reaching a function the real fix changed, taking the median over that task's search words that reach the fix at all.

| Task | Narrow Box: functions, % of source | Gate 1 lean % | Fix in Box | After subtraction: functions, fix kept | Trace names fix | Words reaching fix | Ordinary median | Box-first median | Seconds plain / traced / neighbours |
|---|---|---|---|---|---|---|---|---|---|
| astropy__astropy-14539 | 578, 8.6% | 41.3% | yes | 6, no | yes, #1 of 3 | 3 of 20 | 194 | 11 | 3.9 / 4.29 / 4.54 |
| astropy__astropy-7166 | 53, 1.4% | 27.8% | yes | 0, no | no (0 named) | 1 of 13 | 5 | 1 | 1.17 / 1.69 / 2.24 |
| astropy__astropy-14182 | 482, 7.5% | 35.8% | yes | 6, no | no (6 named) | 2 of 31 | 280.0 | 168.0 | 2.09 / 3.37 / 3.25 |
| astropy__astropy-13033 | 528, 7.5% | 37.8% | yes | 7, no | no (0 named) | 2 of 18 | 625.0 | 25.5 | 1.98 / 3.48 / 4.19 |
| astropy__astropy-14508 | 545, 8.7% | 41.9% | yes | 1, yes | no (3 named) | 3 of 23 | 3 | 3 | 2.49 / 4.72 / 4.92 |
| django__django-13786 | 545, 8.2% | 34.1% | yes | 0, no | no (0 named) | 4 of 13 | 22.5 | 1.5 | 0.91 / 1.17 / 1.26 |
| django__django-15467 | 639, 9.0% | 55.3% | yes | 0, no | no (0 named) | 6 of 16 | 10.0 | 4.5 | 1.39 / 1.12 / 4.74 |
| django__django-12193 | 501, 7.4% | 44.4% | yes | 0, no | no (0 named) | 1 of 12 | 32 | 4 | 0.88 / 1.59 / 1.1 |
| django__django-16116 | unknown: no execution record |||||||||
| django__django-14752 | 1515, 21.2% | 55.6% | yes | 0, no | no (0 named) | 14 of 36 | 1.0 | 1.0 | 1.98 / 3.99 / 4.17 |
| matplotlib__matplotlib-24570 | 327, 4.7% | 39.4% | yes | 138, yes | no (0 named) | 0 of 23 | - | - | 4.53 / 2.38 / 2.23 |
| matplotlib__matplotlib-21568 | 263, 3.9% | 35.9% | yes | 66, yes | no (0 named) | 0 of 25 | - | - | 5.43 / 3.89 / 3.75 |
| matplotlib__matplotlib-23412 | 889, 11.6% | 38.9% | yes | 693, yes | no (1 named) | 0 of 22 | - | - | 10.7 / 3.64 / 2.82 |
| matplotlib__matplotlib-26113 | 959, 12.5% | n/a | yes | 757, yes | no (1 named) | 5 of 22 | 145 | 1 | 10.98 / 7.9 / 4.52 |
| matplotlib__matplotlib-13989 | 655, 9.1% | n/a | yes | 446, yes | no (0 named) | 1 of 19 | 39 | 1 | 5.81 / 3.85 / 2.95 |
| scikit-learn__scikit-learn-11578 | 108, 3.4% | 32.4% | yes | 1, no | no (0 named) | 18 of 54 | 185.5 | 3.5 | 1.98 / 1.91 / 10.48 |
| scikit-learn__scikit-learn-14087 | 78, 3.4% | 32.2% | yes | 0, no | yes, #1 of 1 | 10 of 26 | 4.5 | 1.0 | 2.0 / 2.31 / 24.64 |
| scikit-learn__scikit-learn-12585 | 45, 0.6% | 29.6% | yes | 0, no | yes, #1 of 1 | 3 of 10 | 5 | 1 | 1.12 / 1.63 / 1.51 |
| scikit-learn__scikit-learn-14894 | 48, 1.3% | 29.0% | yes | 1, yes | yes, #1 of 2 | 12 of 24 | 17.0 | 2.0 | 1.19 / 1.6 / 5.82 |
| scikit-learn__scikit-learn-13124 | 58, 1.2% | 31.3% | yes | 0, no | no (0 named) | 5 of 28 | 274 | 8 | 1.15 / 1.96 / 5.43 |
| sphinx-doc__sphinx-7454 | 33, 0.6% | 48.3% | yes | 0, no | no (1 named) | 1 of 29 | 47 | 1 | 0.75 / 1.34 / 3.97 |
| sphinx-doc__sphinx-9320 | 31, 0.7% | 47.4% | yes | 1, no | yes, #2 of 2 | 4 of 21 | 30.0 | 1.0 | 0.65 / 1.35 / 2.84 |
| sphinx-doc__sphinx-10614 | 758, 19.4% | 51.1% | yes | 3, no | no (0 named) | 1 of 22 | 9 | 6 | 1.64 / 2.18 / 3.49 |
| sphinx-doc__sphinx-8595 | 433, 9.2% | 39.9% | yes | n/a | no (0 named) | 2 of 23 | 33.5 | 21.5 | 1.33 / 2.64 / - |
| sphinx-doc__sphinx-11445 | 317, 7.5% | 38.3% | yes | 1, no | no (0 named) | 1 of 15 | 7 | 1 | 1.03 / 1.69 / 1.72 |
| sympy__sympy-12481 | 332, 2.9% | 20.9% | yes | 2, no | yes, #1 of 1 | 1 of 1 | 262 | 10 | 1.68 / 2.65 / 1.89 |
| sympy__sympy-12096 | 326, 2.6% | 20.5% | yes | 2, no | no (0 named) | 5 of 6 | 13 | 3 | 1.16 / 1.47 / 1.97 |
| sympy__sympy-16597 | 382, 1.9% | 15.4% | NO | 2, no | no (0 named) | 2 of 10 | 1821.0 | 1835.5 | 1.38 / 2.14 / 10.6 |
| sympy__sympy-22914 (file target) | 768, 3.4% | 16.7% | yes | 153, yes | no (0 named) | 6 of 11 | 406.0 | 15.5 | 1.6 / 2.43 / 1.92 |
| sympy__sympy-16766 (file target) | 662, 3.2% | 15.1% | yes | 233, yes | no (0 named) | 6 of 11 | 331.0 | 15.5 | 1.3 / 2.07 / 2.24 |

## What was predicted and what happened

1. *Narrow Box under 5% of production source on most tasks.* Barely: 15 of 29. The median is 4.7%, and it is still hundreds of functions, because starting the test framework and importing the library run a great deal of code.
2. *Fix in the narrow Box on at least four in five.* Held: 28 of 29.
3. *Error trace names the fix on fewer than half.* Held: 6 of 29.
4. *Subtracting passing neighbours removes most of the Box and too often the fix with it.* Held, more strongly than expected: the fix survived on 9 of 27. A function that needs fixing is usually one that passing tests also run.
5. *Box-first search clearly shorter on most.* Held: 14 of 20.

## Time to make a Box

Seconds. One untraced run of the failing test took a median of 1.6 seconds and the traced run 2.2; no run reached the 300-second cap (Gate 1's two timeouts came from tracing whole test files with line events). Reading every Python file's structure on the host took a median of 3.7 seconds and is the same for every task on a given commit, so it can be prepared once. Building the Box from a trace took two hundredths of a second. What must be fresh: one traced run of the failing test, because the test is new. What could be looked up: the passing tests' traces, from any earlier full traced run. Pulling the prepared images took between 1 and 546 seconds a task, median 37, 48 minutes in all; that is the benchmark's cost, not the Box's.

Heavier techniques, not built. *True dynamic slicing* would keep only statements the wrong value depended on, which the reading found to be a few percent of what ran; it needs a statement-level trace with data dependences, took hours per run in one paper, and no maintained Python tool for it was found in Gate 0. *Subtracting passing runs at statement level* (the method behind fault-localisation scores) would keep the fix when passing tests run the same function by a different path; it needs line tracing, which is what made Gate 1 slow, and one traced run per passing test.

## Meaning and limits

- **A count of places is a stand-in for an agent, not a measurement of one.** An agent does not read search results in path order and does not take words mechanically.
- **The gains are large as ratios and often small as counts.** With the best word, ordinary search already reaches the fix in a median of 6 places. The big absolute savings are on a handful of tasks with common words.
- **Ordinary search here includes test files.** An agent that skips tests would do better than the "ordinary" column; that comparison was not in the plan and is left to the sceptic as a sensitivity.
- **Three scoreable tasks had no word that reaches the fix at all** (all Matplotlib). Search by these words would not have found the fix with or without a Box; they count neither for nor against.
- **One task's fix was not in the Box** (SymPy 16597: six functions changed, none run by the named test; the patch also changes module-level rules, which a Box of functions cannot hold and the target rule ignores). There the Box cost 14 extra places on 1,821.
- **The word rule is generous to any filter.** 31 of the 86 words counted as reaching the fix are generic and only reach it after more than 100 places. Class names never count as reaching, because only functions are targets. Taking matches in path order favours whatever narrows the list.
- **Thirty tasks, six projects, Python, one run each.** One task stayed unknown: its failing test is named by a sentence of description, which the fixed rule cannot turn into a test name.
- **SymPy was run in-process** by calling its runner as a function, since its own command starts a subprocess the tracer cannot see. Its name matching is by substring.
- The target is the historical fix. Another correct fix could lie elsewhere.

## Corrections made during the session

- The measurement script was run on the first task alone as a check of the instrument before the other 29 had run. Its decision code was reordered once after that (the order in which "could not be decided" is tested); no threshold changed.
- The admission parser missed an older pytest's output format and left one task (Astropy 7166) unknown. It was corrected to read that format. The summary before the correction is kept as `gate-1b/summary-before-parser-correction.json`: 28 scoreable, 13 of 19, same verdict.
- The sceptic judged both corrections above honestly handled and the verdict the same without them.
- The container run was interrupted once by the host after 16 tasks. One half-finished attempt was set aside under `records/history/` and that task rerun from the start.

## What follows from this

Gate 1b was to be the last measurement of the Box. What it leaves:

- The narrow Box is cheap (seconds) and nearly always contains the fix. Those two stand.
- Whether searching it first saves an agent anything is not settled by counting places. The honest comparison for any next step is against an agent that searches non-test files with a well-chosen word, and against the file-level filter, both of which are free.
- Subtracting what passing tests ran, at the level of whole functions, throws the fix away two times in three. Do not use it.
