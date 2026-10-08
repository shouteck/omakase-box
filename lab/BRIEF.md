# Research brief for the CTO

**No wave is in flight. Gate 1b has a result: worth going on by the letter of the rule fixed in advance, and the lab's own sceptic weakens that to "suggests". The decision whether Gate 1c runs is yours.**

Replaced 8 October 2026 after Gate 1b; master through `f47414f`, lab level with it. Plan pushed before any run (`ba544f5`). Detail: `lab/lines/box-trial/gate-1b-result.md`.

## Gate 1b: one table, one sentence

| | |
|---|---|
| Tasks scoreable | 29 of 30 |
| Narrow Box (functions the one failing test ran), share of source | 0.6% to 21%, median 4.7%; median 433 functions |
| A function the real fix changed is in it | 26 of 29, plus 2 where only the patched file is represented |
| The error trace alone names the fix | 6 of 29 |
| Minus what passing neighbours ran: fix survives | 9 of 27; not usable |
| Box-first search reaches the fix in at most half the places | 14 of 20 |
| Box-first costs noticeably more | 0 of 20 |
| Time: failing test plain, traced; build the Box | 1.6 s, 2.2 s at the median; 0.02 s |

**Sentence:** a Box of what one failing test ran is cheap and nearly always contains the fix, and searching it first shortens a mechanical search on most tasks; but with a well-chosen word ordinary search already lands within ten places on 13 of 20, where the same rule would say stop.

## What you should weigh

1. **The pass is real by the rule and thin in substance.** It holds if ordinary search skips test files (13 of 20) and if words come from the issue only (13 of 19). It fails with each task's best word (8 or 9 of 20).
2. **A cruder filter does nearly as well.** "Search only the files the failing test ran" scores 12 of 20 and holds the patched file on 29 of 29. Function-level detail adds little on this measure.
3. **Start-up noise is the Box's problem, and the obvious cure does not work.** The Box is still hundreds of functions; subtracting what passing tests ran removes the fix two times in three, because the function that needs fixing is usually one passing tests also run.
4. **Speed is not the problem.** Seconds per task, no timeouts. Your concern from Gate 1's two timeouts is answered: they came from line tracing of whole test files.
5. **Two of your settings changed the count:** tracing SymPy in-process recovered its five tasks; one task stays unknown because its failing test is named by a sentence.

## Advice

- If Gate 1c runs, aim it at point 3: ranking inside the Box (what ran only in the failing test at statement level, distance from the failure, recency), since size and speed are no longer the question. Its scoring baseline should be test-free search with a good word, and the file-level filter, not the plan's median over mechanical words.
- Counting places has now told all it can. Whether a Box saves an agent tokens needs Gate 3's kind of evidence; Gate 2's published trajectories could give some of it at no token cost.
- The instrument scores any Box given as a set of function keys, so a catalogue technique can be scored on these thirty tasks without new plumbing.

## Other lines

A, B, C, E paused, unchanged. E's session 2 in the redirected area has not run.

## Needed from the kitchen and the owner

Nothing. Housekeeping: every image this gate pulled is removed; raw logs and traces (small) are on disk with hashes in Git.
