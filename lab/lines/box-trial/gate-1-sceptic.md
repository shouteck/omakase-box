# Gate 1 sceptic: the narrow failure stands

8 October 2026. Independent sceptic pass against frozen result `b420729`, on the Windows host `C:/Users/shout/Desktop/Projects/private-task-mvp-lab`, branch `lab`. Reviewer: this fresh Codex subagent; the actual serving model identifier is not exposed, so none is invented. Host Python: bundled `C:/Users/shout/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`; fresh container Python 3.9.20. No repair agent/model or paid service was used.

**Standing: Gate 1 FAIL survives reproduction. This conservative method misses the specified size threshold; the evidence does not reject every open-Box method or establish repair/token savings.** Recounting all fixed rows gives 0 passes, 23 admitted failures and 7 unknowns. Even all seven unknowns succeeding cannot reach 15/30. No task was replaced.

## Exact cached reproduction

I copied the instrument scripts/tasks and the three preregistered first completed IDs alphabetically into my disposable sibling `gate-1-sceptic-work`, then ran `check.py` and `measure.py astropy__astropy-13033 astropy__astropy-14182 astropy__astropy-14508` there. Kitchen was idle. Every field of each rerun measurement, including all three presentation hashes, matched the original. Authored calibration passed. A three-row rerun says aggregate `undecidable` because its aggregate threshold requires 30 rows; that is expected, not a discrepancy with the full-sample failure.

| Instance | Production bytes | Full / marked / lean bytes | Lean ratio | All fix names |
|---|---:|---:|---:|---|
| astropy__astropy-13033 | 7,114,118 | 6,581,675 / 6,605,422 / 2,685,674 | 37.7513% | No |
| astropy__astropy-14182 | 7,258,141 | 6,705,976 / 6,726,653 / 2,596,493 | 35.7735% | No |
| astropy__astropy-14508 | 7,342,677 | 6,926,034 / 6,961,828 / 3,073,023 | 41.8515% | Yes |

Independent source-byte sums reproduced these denominators. Numerators include tests, comments, setup, signatures, paths, index and header. This is the planned asymmetric denominator: production source excludes tests while packaging carries selected tests. All-tracked-Python and primary-package sensitivities expose that choice; installed dependencies must not be used to claim the production threshold passed.

Raw named failures and actual test-body calls support admission. Gold mapping correctly marks the executed existing `_check_required_columns`, `RST.__init__`, `RST.write` and `_format_float`; their bodies are retained. The first two tasks fail naming because the gold patch introduces `BaseTimeSeries._check_required_columns.as_scalar_or_list_str` and `RST.read`, respectively. Constructor, nested addition and module anchors are accounted for. For 14508, `_format_float` is named, executed and body-present at file rank 31/function rank 359.

## Stronger execution reproduction

In the same sibling, with an initially empty 14539 record, I ran `run.py astropy__astropy-14539` using `image-digests.json`, then measured it. Authorized Docker escalation was necessary because ordinary sandbox access to the daemon was denied. The existing public image was reused at digest `sha256:057fa218066fc3a4e4c4e0c0128be077cbf7d2284a97f47227093a6410840e71`; execution had network `none`, all capabilities dropped, no-new-privileges, 4 GB/2 CPUs/128 pids, and only read-only bridge/task mounts. Kitchen idle checks preceded work. The runner removed its own container.

Both `TestDiff::test_identical_tables` and `TestDiff::test_different_table_data` reproduced normal named failures with test bodies traced, exit 1, no timeout. Base HEAD was `c0a24c1dc957a3b565294213f435fefb2ec99714`. Source/test snapshot contents, trace file/call membership, presentation hashes, all sizes, fix inclusion and ranks matched. The only measurement difference was elapsed time: 8.243681178 seconds originally, 7.954947884 seconds freshly. Lean remained 3,030,839 / 7,343,054 bytes = 41.2749%. Fresh dependency count 21,888,212 bytes independently confirms the disclosed ancillary correction.

Fresh receipts retained here before removing scratch: bridge SHA256 `a7f781d574e5b7e82be1ed4e5c284e44aba4e520d4c275304f2ff35b6ac5486e`; compressed source `7b26945abf2492ea3bd0cc2e474b235e2e1784a4b1ef6e5c8ed84de3bb9e8256`; trace `d5f04bbe5d79d0ab7dd54f0fdd09254eeaca7c0a78fb4859da4d7358e2772816`; tests `cb6fdf129647e57c708f15f7e185264825f6642cef626156aec6ebc4f22d0c68`; test log `856583f389eae72e52a6fe4bcc728dbed6c080f1f177922a4f2525b22bfe28b2`. These are receipts, not preserved raw fresh artifacts; reproduction uses the pinned image and committed scripts. Original raw records remain untouched.

## Attacks and limits

- I independently recomputed selection from the local 500 unique population IDs: SHA256 ordering and first five per repository reproduce all 30 IDs. `tasks.json` matches recorded hash `84b5276b4f947777898afc3fa24c07778e99321c4a52bc2644684f0d95bb64ca`. I independently checked every current attempt's listed raw artifact receipt and every available gold removed/context line against the source snapshots for all 30: zero mismatches. This checks local evidence; I did not independently reacquire the upstream dataset/revision.
- Manifest file order matches first runtime event, then lexical closure. Function ranks describe the recommended manifest order, while presentation bodies retain source order. Therefore ranks are not a measurement of how far an agent must read through the emitted text. Ranking/product claims need this qualification.
- Call identity is a source-line heuristic. `audit.json` is useful receipt/context checking and a generous sensitivity, not certification of perfect body attribution. I expanded candidate inspection to AST lambdas and comprehensions at decorated start/definition lines, and module line 1. Removing entire potentially aliased spans and index names still leaves admitted minima 27.7985% of production and 11.1095% of all tracked Python. This attack does not rescue the threshold; it is not a general proof that every call attribution is exact.
- The scorer detects new functions by qualified-name novelty, so an added same-name property setter/duplicate definition could evade its new-function rule. An AST name-multiplicity check of this sample found no such additions. This is an instrument limitation, not an observed score discrepancy here.
- Preregistered `f5e4506` retained unexecuted docstrings. Dropping them after three preliminary measurements was a material post-result method change; calling the final detail fully preregistered would be wrong. Original docstring-retaining sizes remain recorded and also fail. The correction favors smaller packaging, yet all admitted tasks still miss by a wide margin. Tracer performance, pytest parsing and dependency corrections are disclosed; the stronger fresh run supports the corrected execution rather than the timed-out first attempt. Moving untraced SymPy subprocess tasks to unknown is appropriate and cannot change the gate verdict.

Only this method on this balanced six-repository sample is decided. Whole modified test files and transitive import closure explain much of the size; individual failing-test scope or a different closure would be a different experiment. Subprocesses and compiled extensions remain unobserved. The instrument is not ready to transfer as a product on this result. Stop after Gate 1.
