# Box trial notebook

## 8 October 2026 — Gate 0

Request: `Lab.MD gate 0`. Synced origin/master (already up to date), read kitchen status and For the lab; no new kitchen requirement changed this reading. Applied the owner's open packaging decision added to PROGRAMME during this session.

Read the full PDFs for the five named slots (eight publications, 131 pages), with no additional survey slot. Used public primary papers, bundled pypdf and local table rendering; no installations or paper-code execution, benchmark runs, repair-model/API calls or paid services. PDF scratch remains outside Git in the system temporary folder.

Finding: cheap computed repair context is worth the next size measurement, but published denominators, granularity, oracle locations and repair pipelines do not settle our gate. Source reduction alone is not the 2024 repair-speed headline; slicing can remove the actual fix despite identical failure output. Smaller prompts can produce fewer correct fixes. No native TS/Python Stubbifier equivalence claim is established by this bounded list.

Decision: Gate 0 PASS. Narrow next session to source packaging size, inclusion and rank of changed functions, using the existing tracer without building runnable stubs. Keep historical fixes out of construction; retain comment intent and test setup; record outside-Box reading later. Gate 1 not started.

Principles: Laziness Protocol deferred stub construction; Prove It Works required a fresh reader of two source papers; Guard the Context Window kept the CTO handoff compact. The independent reader's finding is appended after review.

Fresh-reader result: PASS. A separate reader independently read all 37 pages of Reduction and CausalRepair, checked the table and supported the bounded gate verdict. No material correction; added the further baseline-selection qualification for Reduction's six starred cases. Reviewer did no experiments or edits. Temporary paper/render scratch was removed after verification; source URLs, page counts and hashes remain for rereading.

## 8 October 2026 — Gate 1

Request: `Lab.MD gate 1`. Fetched and merged origin/master (already current), read kitchen status and For the lab; no new requirement changed this gate. Followed the owner's open-packaging override. Selection rule and threshold committed at f5e4506 before dataset acquisition: five hash-selected SWE-bench Verified tasks from each of six Python repositories, no replacements. Historical production patches entered scoring only after packaging construction.

Ran all thirty tasks sequentially in public prepared containers, network off, no installs, with whole test files named by the benchmark test patch. Reused the existing AST adapter with native call/line tracing and local import closure. Saved immutable image identities, source/test/trace receipts, all three detail sizes and fix anchors. No repair models, paid services, Gate 2 trajectories or product changes.

Corrections are explicit: preserved the first slow Astropy attempt and retraced the same task after caching path resolution; corrected output parsing; corrected the first ancillary installed-dependency count; changed unexecuted functions from full docstrings to signatures after preliminary measurements, retaining the original format as sensitivity; excluded parent-only SymPy traces after the final completeness check. No task, denominator or pass threshold changed.

Result: Gate 1 FAIL, zero confirmed successes, 23 failures and seven unknown. Lean text was 27.8–55.6% of production Python, median 38.9%; even all tracked Python including tests/docs gives 11.1–35.4%, median 20.2%, with zero successes. Nineteen admitted tasks name every changed function/edit and retain every changed body; the four misses add new functions. Two Matplotlib runs timed out; five SymPy native runners used untraced subprocesses. At most seven unknown successes cannot reach fifteen.

The package-plus-installed-dependency envelope yields 2.0–8.8%, but is inflated rather than a measured minimal transitive dependency closure. Function ordering is a manifest recommendation; source bodies retain source order. Whole modified test files and import closure make this a conservative method, not a conclusion about all possible slices. Raw artifact hashes and gold baseline contexts match for all thirty tasks; call identity alias sensitivity is qualified in the report.

Principles applied: Model the Domain separated naming, body retention, execution completeness and denominator; Sequence Verifiable Units froze selection then calibrated construction before scoring; Prove It Works requires the fresh sceptic sample; Guard the Context Window kept the handoff to one table. Three independent packaging reruns match exactly; fresh native Astropy 14539 reproduction also matches all measurement fields and presentation hashes except elapsed time. The fresh sceptic confirms the narrow failure; expanded call-alias sensitivity leaves minima 27.7985% production and 11.1095% all Python. A sample name-multiplicity check found no added same-name setters, while identifying that scoring limitation for future use. Reviewer removed its own disposable copy/container. Final review is in gate-1-sceptic.md. Stop before Gate 2; owner and CTO decide, other lines paused.

Closeout: removed only the five gate-owned retained image tags, with successful Docker receipts in gate-1/cleanup.json and no gate containers remaining. Original raw benchmark artifacts stay locally available under ignored records; committed hashes, scripts and pinned public image digests support reproduction. Calibration and whitespace checks passed.

## 8 October 2026: Gate 1b, the Box as the first place to search

**Set out to do.** Gate 1b as the programme sets it: on Gate 1's thirty tasks, by script, the narrow Box, the same minus passing neighbours, the error trace as baseline, a search three ways, and the time to make a Box.

**Before any run.** Lab level with master and origin; kitchen idle. Wrote `gate-1b-plan.md` with definitions, the word rule, the decision thresholds and five predictions, and pushed it (`ba544f5`) before the first container started.

**Did.** New bridge and runner in `gate-1b/` (call events only, three phases, one image held at a time). Thirty tasks run in pinned images with the network off. Host measurement, known-answer checks, a report script. The run was interrupted by the host after 16 tasks; one half-finished attempt set aside, its container removed, the rest resumed.

**Result.** 29 of 30 scoreable. Narrow Box median 4.7% of production source, 433 functions. A changed function in the Box on 26, the patched file represented on 2 more. Error trace names the fix on 6. Subtraction keeps the fix on 9 of 27 and was left out. Box-first clearly fewer places on 14 of 20, costly on none: "worth going on" by the fixed rule. Test run 1.6 seconds plain and 2.2 traced at the median.

**Predictions.** Four held. The first (under 5% on most) held by one task.

**Surprise.** Calling SymPy's runner in-process recovered all five tasks Gate 1 lost, and dropping line events removed both of Gate 1's timeouts. The other surprise is the size of the start-up noise: hundreds of functions run before a one-line test does anything.

**The sceptic.** Reran three tasks and one fresh container run: identical. Its sensitivities are the important part: the pass survives test-free ordinary search and issue-only words, but with each task's best word only 8 or 9 of 20 show a clear gain, and a file-level filter does nearly as well. The result page now says "suggests", not "shows". It also corrected "28 of 29" to 26 plus 2, and the pull-time sentence.

**Mistakes.** The admission parser missed an older pytest format; found because a task that plainly failed was listed unknown, fixed, with the earlier summary kept. One edit put a control character into a regular expression through a shell here-document; caught by the same symptom. The lead measured the first task before the rest had run.

**Cost.** Nothing paid. About 48 minutes of image pulls and a few minutes of test runs. All gate-pulled images removed at the end; no container left.

**Principles that changed a decision.** *Sequence verifiable units*: plan pushed before runs, and the decision rule written as code with its own checks. *Build the lever*: a Box is any set of function keys to the scorer, so another technique can be scored without rewriting. *Explain the number*: the sceptic's best-word sensitivity is what turned a pass into "suggests".

**Next.** The CTO reads the result. Gate 1c (the catalogue) is the programme's next gate if this counts as go on; the lab does not start it in this session.
