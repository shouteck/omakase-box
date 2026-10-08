# Gate 3b: actual-query replay

8 October 2026. Free steps 1 and 2 only; no repair agent or live pair ran. The plan was pushed at c5cddfe before measurement. The corpus contains all 226 search-containing actions from the twelve Gate 3 controls and the two Gate 2 published agents on the same twelve tasks, with original record hashes.

| Task | Native searches | Qualified queries reaching a changed function | Median places before it: ordinary / Box | Clearly nearer | Queries made later |
|---|---:|---:|---:|---|---:|
| astropy__astropy-13033 | 17 | 3 | 2 / 0 | yes | 0 |
| astropy__astropy-14539 | 24 | 7 | 1 / 0 | yes | 0 |
| django__django-12193 | 22 | 4 | 3.5 / 1 | yes | 0 |
| django__django-14752 | 9 | 0 | — / — | no | 0 |
| django__django-15467 | 15 | 3 | 0 / 0 | no | 0 |
| matplotlib__matplotlib-21568 | 21 | 3 | 0 / 0 | no | 0 |
| scikit-learn__scikit-learn-12585 | 13 | 6 | 0 / 0 | no | 0 |
| scikit-learn__scikit-learn-13124 | 15 | 2 | 1 / 1 | no | 0 |
| scikit-learn__scikit-learn-14087 | 15 | 6 | 2 / 0 | yes | 0 |
| sphinx-doc__sphinx-10614 | 35 | 2 | 3.5 / 2.5 | no | 0 |
| sphinx-doc__sphinx-11445 | 9 | 4 | 5 / 0 | yes | 0 |
| sympy__sympy-16597 | 48 | 5 | 48 / 48 | no | 3 |

**Sentence:** five of eleven tasks with qualified function-reaching queries met the fixed “clearly nearer” rule, and three searches on SymPy moved a historical-fix match later, so Gate 3b stops under its fixed rule without a live pair.

## What was measured

“Clearly nearer” was fixed as at most half the median preceding matches and at least one match saved. The comparator is the native invocation's complete stream before downstream head/tail/filter; this is a ranking proxy, not the final text a repair agent saw. Context-only lines are not hits. File-only searches are separate. No-target searches remain in the per-query record; source/environment/format unknowns do not become wins. The result is descriptive, not a population test.

Native search arguments, working directory, stdout, stderr and exit were retained. The wrapper reorders complete human-readable records or intact context groups, marking exercised code only in final displayed output. Pipeline inputs stay unmarked. File-name searches prioritize files from the trace without reading binaries. Machine formats pass through. The full repository stays available. No Box listing is supplied to an agent.

The modern fixture passed 18 compatibility cases; the final legacy fixture passed 20, including actual decorated Django source and the real file-search pipeline. All 243 captured native invocation streams preserve their output record multiplicities; no final ordering fault is recorded. There are 220 covered search actions. Six Sphinx generated-output actions could not invoke their searches because the skipped build's /tmp/prologbug environment was absent. They remain unknown, not empty searches or successes. Source-changing actions were replayed when recognized; expensive build/install/test actions were skipped with provenance and uncertainty. This is not a complete exact replay of every environment.

## Decisive counterexample and its limit

On pristine SymPy base 6fd65310fa3167b9626c38a5487e171ca407d988, the published Gemini command `grep -rn "rational.*real" sympy/` returned a match in get_known_facts_cnf first. It is in the historical fix but outside the failing-test function trace. Promoting two matches from exercised functions moved it to third, while retaining every native match. Two GPT searches for integer=True moved their first historical-fix match from 58 to 59. The first direct, unpiped example alone violates “never further down.”

The target is a historical patch, not a proof that this function must be edited for every correct repair. Its generated/collateral helpers can differ from the runtime code an alternative patch needs. Some historical edits are module-level and are not function targets at all. Therefore this is a failure of the written ranking gate, not proof that Box ordering worsens repairs or cannot help an agent. Search locates classes/files as well as matching functions; this metric does not count all useful navigation. stdin filters can also inherit an upstream reordered stream, so component ranks do not establish the complete ordinary pipeline's rank. These limitations do not remove the direct pristine counterexample.

## Instrument corrections and review

Preliminary receipts and source versions are preserved under committed hashes. Mark placement before pipes, missing legacy AST end positions/decorator semantics, sample-only completeness checks, and unnecessary binary reads in file searches were corrected before any live agent. Failed preliminary measurements are excluded; complete unaffected receipts retain their earlier wrapper version. Gold is consulted only by scoring, never by ordering. No ranking/selection/pass rule was tuned after results.

Independent review: pending. The reviewer will reproduce the first task, first Django task and SymPy regressions, check native preservation and provenance, and challenge the historical-fix interpretation. No product transfer or further comparison is authorized by this result.

[Fixed plan](gate-3b-plan.md), [instrument](gate-3b/README.md), [query summary](gate-3b/summary.json), [corpus](gate-3b/corpus.json).
