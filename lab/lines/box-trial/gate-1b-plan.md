# Gate 1b plan: the Box as the first place to search

Fixed 8 October 2026, before any Gate 1b container run and before any Gate 1b script has been executed on a task. Authority: PROGRAMME.md, "Gate 1b". Committed and pushed before the first run. The writer has seen Gate 1's results (sizes, which tasks traced) and nothing of what this gate measures.

## Sample

The same 30 tasks as Gate 1 (`gate-1/sample.json`), the same pinned images (`gate-1/image-digests.json`), the same base snapshots (`gate-1/records/<task>/sources.json.gz`). No task is added, dropped or replaced. Python only.

## Runs, per task, in the pinned image, network off

Each in a fresh process with a 300-second cap. The benchmark's test patch is applied first; the historical fix is never present in the container.

1. **Plain.** The named failing tests only (`FAIL_TO_PASS`), untraced. Output kept. Seconds recorded.
2. **Traced failing.** The same command under a call tracer that records every function call in repository files (file and first line). No line events. Seconds recorded.
3. **Traced passing neighbours.** The tests in `PASS_TO_PASS` that live in the same test file (pytest), same test module (Django) or same test files (SymPy) as a failing test, in one traced process.

How one test is named, by runner. pytest: the node id as given. Django: `tests/runtests.py --settings=test_sqlite --parallel 1` with the label `module.Class.test_name` built from the benchmark's `test_name (module.Class)`. SymPy: Gate 1 lost all five tasks because the project's runner starts a subprocess; here the runner is called in-process, `sympy.test(<test files>, kw=<names>, subprocess=False, verbose=True)`. Its name match is by substring, so a named test can pull in others whose names contain it; that is recorded, not corrected. If this does not produce a trace containing a call from the test file, the task stays unknown.

**Admission.** A task is scoreable only if: the plain run finished inside the cap and reports at least one named failing test as failed or errored; the traced run finished and contains at least one call from a test file; and the real fix changes at least one line of production Python. Otherwise unknown, with the reason. Unknowns are never counted either way.

## Definitions, all computed on the host from the base snapshot with Python's `ast`

- **Production file:** Gate 1's rule (`gate-1/measure.py: production`), unchanged.
- **Function:** a `def` or `async def`, identified by file and the first line of its header including decorators. A call from a lambda or comprehension is credited to the innermost enclosing function; module-level code is not a function and is ignored.
- **The fix's functions (the target):** existing production functions containing at least one line the historical patch removes or replaces, or directly enclosing a line it inserts at. If the patch touches no existing function (only new functions or module-level lines), the target is the patched production files, and the task is flagged `file-target`.
- **Narrow Box:** production functions called in run 2. No imports added, no files added.
- **Subtracted Box:** the narrow Box minus production functions called in run 3. If run 3 is missing or timed out, this Box is unknown for the task.
- **Size:** bytes of the functions' source text, against Gate 1's production-source bytes for the task, and the number of functions.
- **Fix in Box:** any target function is in the Box (primary); all are (also reported). For `file-target` tasks: any Box function lies in a patched file.

## Step 2 rule

The subtracted Box is used in the search only if, among scoreable tasks where the fix is in the narrow Box, it still holds the fix on at least four in five. Otherwise it is reported and left out of step 4.

## Step 3: the error trace

From run 1's output, every traceback frame, matching `File "<path>", line <n>, in <name>` and pytest's `<path>:<n>: in <name>`. A frame names a function when its path and line fall inside that function in the snapshot. **The trace names the fix** when any frame falls in a target function (or, for `file-target`, a patched file). Also recorded: how many distinct production functions the trace names, and the fix's position among them counting from the innermost frame outward.

## Step 4: search words and the count

**Words.** Two texts: the issue (`problem_statement`) and the failure message (run 1's output from the first line containing `FAILURES`, `ERRORS`, `Traceback`, `FAIL:` or `ERROR:` to the end). A word is a maximal `[A-Za-z_][A-Za-z0-9_]*` of at least four characters that looks like a code name in the text where it appears: it contains an underscore, or has a lower-case letter directly followed by an upper-case one, or is directly followed by `(`, or directly follows a `.`. Python keywords and builtin names are dropped. The word set is the union over the two texts, in order of first appearance, issue first, capped at the first 60. Which text each word came from is recorded. No word is added or removed by hand.

**Search.** Whole-word, case-sensitive match on lines of the base snapshot. Matches are taken with files in path order and lines in ascending order.

- (a) **Ordinary:** all tracked Python files in the snapshot, tests included.
- (b) **Narrow Box:** only lines inside narrow-Box functions.
- (c) **Subtracted Box**, if step 2 admits it.

For each word and each of (a) to (c): the number of matching lines, and the **places before the fix**: the position of the first matching line that lies inside a target function (or patched file). If there is none, the word does not reach the fix there.

**Box-first cost of a word.** If the Box search reaches the fix: its position in the Box. If not: all the Box's matches for that word, plus the ordinary position.

**Per task.** Over the words whose ordinary search reaches the fix: the median ordinary position and the median Box-first cost (primary), and the same for the single word with the best ordinary position (secondary). A task with no such word is `no-word`, reported, and not counted for or against.

## Step 5: time

Per task: seconds for run 1, run 2 and run 3, and host seconds to build each Box. Stated without measurement: which parts could come from a map prepared in advance.

## Decision, fixed now

Let S be the scoreable tasks, T ⊂ S those where the error trace does not name the fix, and W ⊂ T those with at least one word reaching the fix by ordinary search.

- **Stop** if the error trace names the fix on more than half of S; or the fix is in the narrow Box on fewer than half of S; or the condition below fails.
- **Worth going on** if, on more than half of W, the Box-first median is at most half the ordinary median ("clearly fewer"), and on the rest of W the Box-first median is at most 1.2 times the ordinary median ("falling back costs little").
- **Could not be decided** if S has fewer than 15 tasks or W fewer than 8.

The thresholds one half, 1.2, four in five, 15 and 8 are the lab lead's, chosen before any result. They have no other standing.

## What is predicted, so it can be wrong

1. The narrow Box is far smaller than Gate 1's lean packaging: under 5% of production source on most scoreable tasks.
2. The fix is in the narrow Box on at least four scoreable tasks in five.
3. The error trace names the fix on fewer than half.
4. Subtracting passing neighbours removes more than half of the narrow Box and loses the fix on more than one task in five, so it is left out.
5. Box-first search is clearly shorter on most of W.

## Limits known in advance

Counting places is a stand-in for an agent's behaviour. Mechanical words are cruder than an agent's. Thirty tasks, six projects, Python. Calls in subprocesses and compiled code are not seen. The target is the historical fix; another correct fix could lie elsewhere. `PASS_TO_PASS` neighbours are a convenience definition of "start-up noise". One run per task.

## Sceptic

One fresh agent: reruns the host scripts on a sample of cached records and compares, reruns one task's containers afresh if the image is still present, and attacks the word rule and the decision. No agents are run on tasks.
