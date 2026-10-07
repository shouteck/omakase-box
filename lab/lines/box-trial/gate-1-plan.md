# Gate 1: preregistered open packaging measurement

8 October 2026. Owner request: `Lab.MD gate 1`. This file is committed before retrieving task patches or executing benchmark code. The owner's open-Box override controls; no sealed replay or repair agents.

## Sample and stop rule

Use the 500-task test split of `princeton-nlp/SWE-bench_Verified`, recording its revision and file hash. Six large Python repositories: `astropy/astropy`, `django/django`, `matplotlib/matplotlib`, `scikit-learn/scikit-learn`, `sphinx-doc/sphinx`, `sympy/sympy`. Within each, order ascending SHA256 of UTF-8 `box-gate-1-20261008\n` followed by instance_id; take the first five. Thirty fixed tasks, no replacements for unavailable images, setup failures, timeouts, missing traces or non-function fixes. The sample is balanced across these six repositories, not representative of all Verified tasks. Selection reads only repository and instance ID. Historical production patches are score-only, read after packaging has been constructed.

Use public ready-made Epoch SWE-bench x86_64 images, record content digest, one at a time. Pulls download prepared environments; do not install packages or run build backends. Execute code only in containers with network disabled, capabilities dropped, no privileged mode, no writable host mount, bounded CPU/memory/pids and a 300-second per-task test limit. Check kitchen idle before each pull and run. Retain every attempted task. A transport/image blocker that prevents measurements makes the gate undecidable, not failed; do not turn setup failures into evidence against packaging. No paid services.

## Construction, frozen before scoring

Run the benchmark's test patch at its base commit. Test scope is the complete Python test files modified/added by that patch (not production gold files), using the repository's native test entry point. This includes passing guards in those files; it can produce a larger Box than tracing only one failing test. Require an actual nonzero test verdict, a trace and a normal test result containing a named FAIL_TO_PASS test; collection/setup failures alone are not admitted.

Reuse the existing Python AST import-graph adapter, with root `''`, plus `lib` for Sphinx and declared package roots. Extend the tracing bridge with standard-library `sys.settrace` call/line events so prepared older Python environments need no new coverage installation. Capture main thread and threads, including module loads and call first-line identities. Subprocesses are not covered; record this limitation. Select actually executed repository files plus the transitive local AST import closure. Ambiguous/dynamic/unparsed imports are explicit warnings, never invented edges.

Order files by first observed runtime event (executed before closure-only), closure-only files lexically. Order functions within each file by first call event, then source line for unexecuted signatures. Keep original paths, decorators, signatures, docstrings, comments and module/class setup. Test files and conftest files selected by execution or test patch remain whole. No issue text or gold production edit influences selection or order.

Three UTF-8 text presentations: (1) full selected files; (2) those files with an executed-functions index; (3) executed functions kept whole, every other function represented by its original decorated signature and docstring, with a visible omitted-body marker. Classes/module setup remain; nested functions inside a kept function remain whole. This is text, not a runnable stub program. A fixed header records entry command and warnings; count this, file paths, indexes, comments, test setup and signatures in every numerator.

## Measurements and verdict

Denominator: UTF-8 bytes of every tracked `.py`/`.pyi` file at the base commit, excluding test paths (`tests`, `test`, names `test_*.py`/`*_test.py`), docs, examples, benchmarks and vendored paths. Also report all tracked Python bytes including those exclusions to expose denominator sensitivity. Never use disk size, dependencies, Git metadata or generated binaries as repository source.

Free baseline: complete primary package source (including package-internal tests) plus Python source of installed third-party packages in the prepared environment, excluding standard library; report its components separately. This is an environment-wide dependency envelope, not a proved minimal transitive dependency closure. Report the primary-package ratio separately so unused installed dependencies cannot disguise a loss.

After packaging is immutable, parse the historical patch against base AST. Count every removed/changed base line and each added-line insertion anchor; map to innermost function or module/class level. Record newly added functions separately. A changed existing function is named if its file and qualified signature are in the presentation; distinguish full body, signature only and omitted. New functions count as missing (not named at base). Do not let no-function patches pass vacuously: require all changed source files and module/class edit anchors included, and flag them separately. Record file rank, function rank and worst changed-function rank; constructors are ordinary functions.

For each task: all three sizes/ratios; trace/test status; actual changed-file/function membership and ranks; body/signature/omission counts; non-function edits; unexecuted changed functions; unresolved imports; timing and image receipt. Admission or scoring uncertainty is unknown. **PASS if at least 15/30 tasks have at least one presentation strictly below 0.10 of production repository Python bytes and name every function the real fix changed**, with non-function edits included as above. **FAIL if the maximum possible successes, including all unknown tasks, is below 15. Otherwise undecidable.** Report body-preservation as a stricter sensitivity, not the owner's naming criterion. No repair success/token-saving claim follows.

One fresh sceptic at the end reruns scoring/packaging on three deterministic tasks (first by instance ID from completed rows) and checks raw trace/admission and patch mapping. No repair agents. Stop after Gate 1; Gate 2 needs a new owner session.

Sources checked: [Verified dataset](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified), [Epoch image registry and naming](https://github.com/epoch-research/SWE-bench), [official container evaluation](https://www.swebench.com/SWE-bench/guides/quickstart/).

## Recorded implementation correction during execution

After the first three Astropy presentations had been measured (two failed the size threshold; one had an older-output admission parse issue), corrected the third presentation to match the owner's "rest as signatures": unexecuted function docstrings are body text and must be omitted along with the body. The initial plan above retained them in full. Keep that original docstring-retaining size in every row as a sensitivity, rather than erase it. Executed bodies and their intent comments/docstrings, test setup, module/class text, signatures, paths and ranks are unchanged. Selection, sample, denominators and threshold remain frozen. This is an openly recorded correction after preliminary results, so the final detail implementation was not completely preregistered; the sceptic must assess it. No production fix influenced the new omission rule.
