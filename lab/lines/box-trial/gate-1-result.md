# Gate 1: open packaging size

8 October 2026. Fixed sample: 30 SWE-bench Verified tasks, five per repository; six large Python repositories. No repair agents or Gate 2 runs.

**FAIL: zero confirmed successes, 23 confirmed misses and 7 unknown among 30 fixed tasks. Fifteen successes were required; even seven unknown successes cannot reach fifteen.**

| Measurement | Observed |
|---|---|
| Named failing test reproduced and scoreable | 23/30 |
| Lean packaging below 10% of production Python source | 0/23 admitted |
| Every changed function and non-function edit included by name/path | 19/23 admitted |
| Every changed function body retained in lean detail | 19/23 admitted |
| Lean / production Python source | 27.8%–55.6%; median 38.9% |
| Lean / all tracked Python, including tests/docs/examples | 11.1%–35.4%; median 20.2%; 0 combined successes |
| Original full-docstring lean / production Python source | 40.9%–60.9%; median 50.5%; 0 combined successes |
| Lean / whole primary package, including internal tests | 17.4%–53.5%; median 33.8% |
| Lean / primary package + installed dependency envelope | 2.0%–8.8%; median 4.5% |

## Every fixed task

| Task | Result | Files / repo | Marked / repo | Lean / repo | All fix names | Worst function manifest rank |
|---|---|---:|---:|---:|---|---:|
| astropy__astropy-14539 | fail | 92.9% | 93.3% | 41.3% | True | 607 |
| astropy__astropy-7166 | fail | 78.0% | 78.2% | 27.8% | True | 52 |
| astropy__astropy-14182 | fail | 92.4% | 92.7% | 35.8% | False | — |
| astropy__astropy-13033 | fail | 92.5% | 92.8% | 37.8% | False | — |
| astropy__astropy-14508 | fail | 94.3% | 94.8% | 41.9% | True | 359 |
| django__django-13786 | fail | 71.9% | 72.5% | 34.1% | True | 4177 |
| django__django-15467 | fail | 77.3% | 78.8% | 55.3% | True | 4664 |
| django__django-12193 | fail | 78.6% | 79.5% | 44.4% | True | 1297 |
| django__django-16116 | fail | 80.3% | 81.5% | 49.4% | True | 6369 |
| django__django-14752 | fail | 84.9% | 86.1% | 55.6% | False | — |
| matplotlib__matplotlib-24570 | fail | 74.5% | 75.1% | 39.4% | True | 3352 |
| matplotlib__matplotlib-21568 | fail | 73.0% | 73.5% | 35.9% | True | 1100 |
| matplotlib__matplotlib-23412 | fail | 75.3% | 75.9% | 38.9% | True | 1082 |
| matplotlib__matplotlib-26113 | unknown | — | — | — | — | — |
| matplotlib__matplotlib-13989 | unknown | — | — | — | — | — |
| scikit-learn__scikit-learn-11578 | fail | 75.4% | 75.6% | 32.4% | True | 959 |
| scikit-learn__scikit-learn-14087 | fail | 71.1% | 71.3% | 32.2% | True | 729 |
| scikit-learn__scikit-learn-12585 | fail | 78.5% | 78.7% | 29.6% | True | 8 |
| scikit-learn__scikit-learn-14894 | fail | 69.7% | 69.9% | 29.0% | True | 168 |
| scikit-learn__scikit-learn-13124 | fail | 74.0% | 74.2% | 31.3% | True | 658 |
| sphinx-doc__sphinx-7454 | fail | 77.3% | 78.3% | 48.3% | True | 1339 |
| sphinx-doc__sphinx-9320 | fail | 85.0% | 85.8% | 47.4% | False | — |
| sphinx-doc__sphinx-10614 | fail | 85.5% | 86.5% | 51.1% | True | 935 |
| sphinx-doc__sphinx-8595 | fail | 78.5% | 78.9% | 39.9% | True | 1146 |
| sphinx-doc__sphinx-11445 | fail | 84.5% | 84.9% | 38.3% | True | 812 |
| sympy__sympy-12481 | unknown | 77.1% | 77.2% | 20.9% | True | 8965 |
| sympy__sympy-12096 | unknown | 76.6% | 76.8% | 20.5% | True | 1013 |
| sympy__sympy-16597 | unknown | 55.1% | 55.2% | 15.4% | True | 7385 |
| sympy__sympy-22914 | unknown | 57.6% | 57.7% | 16.7% | True | — |
| sympy__sympy-16766 | unknown | 54.9% | 55.0% | 15.1% | False | — |

The two Matplotlib unknowns (26113 and 13989) reached the 300-second test cap without a complete trace. All five SymPy commands ran, but their native runner executed tests in untraced subprocesses; parent-import-only traces are not admitted. Their partial sizes remain visible above. Four admitted naming misses concern new functions introduced by the real fix; no existing changed function was omitted in the admitted cases.

## Meaning and limits

This measures one conservative runtime-plus-local-import-closure method, with whole modified test files as the trace scope. Full AST import closure can pull in most of a library; tracing only individual failed tests or omitting never-executed imports would be a different method and was not tried. The open repository remains available. Small text and named signatures do not establish repair success or token savings. Production Python bytes are a narrower denominator than all languages or disk size; the per-task JSON also gives all tracked Python and primary-package denominators. The installed dependency envelope is deliberately not represented as a minimal transitive closure.

Function ranks refer to the recommendation manifest, not the physical order of function bodies within source files. They do not measure how far an agent would actually read. The raw-receipt audit matched hashes and baseline patch contexts on all 30 tasks. It identified 24 possible first-line call aliases; its generous removal sensitivity still exceeds the size threshold, but this scan is not a complete certification of execution identity. Independent review checks this limitation.

The sample and threshold were committed before dataset acquisition. The final signature-only detail was corrected after preliminary results; the original full-docstring detail is retained as a sensitivity. A slow initial tracer attempt is preserved, not silently replaced; the same task was retraced after a path-resolution performance correction. Output format parsing and the first ancillary dependency count were corrected with raw records preserved. Threads are traced, subprocesses/compiled extensions are not. Unknowns are never counted as passes. Function identity includes its base source line, distinguishing property getter/setter bodies. Historical patches are used only after packaging construction. See the [method and reproduction commands](gate-1/README.md) and [preregistration plus amendment](gate-1-plan.md).

Per-task records include changed function names, constructor identities, body/signature/omission status, new functions, module edits, file/function ranks, unresolved imports, exact sizes, runtime and immutable image/artifact receipts. The aggregate is in `gate-1/aggregate.json`; detailed rows are in `gate-1/summary.json`. Raw snapshots/logs remain on this host with hashes; public pinned images and test overlays permit reconstruction.

## Sceptic

[Independent sceptic review](gate-1-sceptic.md): the narrow failure stands. All three prescribed cached rows matched every measurement and presentation hash. A fresh native Astropy 14539 run on the pinned image matched source/test contents, trace membership, sizes, presentation hashes, ranks and fix inclusion; only elapsed time changed. Independent raw-receipt and patch-context checks found no mismatches across all 30 tasks.

Expanded alias sensitivity, including definition-line lambdas/comprehensions, still leaves admitted minima of 27.7985% production and 11.1095% all tracked Python. A separate name-multiplicity check found no same-name new definitions in this sample, although the scorer could miss an added same-name setter in another sample. Manifest ranking, partial preregistration and incomplete subprocess/compiled tracing remain explicit limitations. This research instrument is not ready for product transfer. Gate 2 was not started.
