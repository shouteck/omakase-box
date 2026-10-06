# Related work: from a request to a check

Surveyed 6 October 2026 (session 1). Zero cost: web search and open-access abstracts only.

**How each source was read.** `[A]` the abstract or page was fetched and read this session; numbers are quoted from it. `[S]` known only from a search-result summary; treat the number as a lead, not a fact, until someone opens the paper. Nothing here was read in full. Anything not marked is the lab's inference.

## What the problem is called

No single name. The pieces sit in software-engineering research under:

- **The test oracle problem**: given an input, how do you know the right output? The oldest name for "what does done mean".
- **Fail-to-pass and pass-to-pass tests**: the SWE-bench convention. A change is accepted when tests that failed before it now pass (the change happened) and tests that passed before still pass (nothing broke).
- **Plausible versus correct patches, and patch overfitting**: from automated program repair. A plausible patch passes the tests; a correct one does what was wanted. The gap between them is this line's false-accept rate.
- **Issue reproduction / reproduction-test generation / test-driven development from issues**: writing the failing test from the request before the fix exists.
- **Intent formalisation, intent clarification, requirements clarification**: turning informal language into something checkable, usually with the user in the loop.
- **Acceptance-test generation, behaviour-driven development (Gherkin), specification by example**: the industry-side names.
- **Test adequacy, mutation testing, test-suite strengthening**: how good a check is.
- **LLM-as-a-judge**: a model's verdict in place of a test.

## 1. How good are checks that already exist? (the best case)

These are developer-written tests that maintainers accepted with the real fix: the strongest check a repository normally has.

**They accept wrong solutions.**

- Wang, Pradel, Liu, *Are "Solved Issues" in SWE-bench Really Solved Correctly?* arXiv:2503.15223 `[A]`. Three issue-solving tools on SWE-bench Verified. 7.8% of patches counted correct fail the developers' full test suite; differential testing shows 29.6% of test-passing patches behave differently from the human fix. Different is not always wrong; a search summary `[S]` gives the inflation of resolve rates as 6.2 points.
- Yu et al., *SWE-ABS*, arXiv:2603.00520 `[A]`. After strengthening tests adversarially, 19.71% of previously passing patches from the top-30 agents are rejected; the top score falls from 78.80% to 62.20%. "One in five solved patches are semantically incorrect."
- Yu, Zhu, He, Kang, *UTBoost*, arXiv:2506.09289 `[A]`. Augmented tests expose 345 patches wrongly labelled as passing; 36 tasks had insufficient tests.
- Aleithan et al., *SWE-Bench+*, arXiv:2410.06992 `[A]`. On the original SWE-bench, about a third of SWE-Agent+GPT-4's successes were "suspicious" because of weak tests, and about a third had the answer in the issue text.
- METR, *Many SWE-bench-passing PRs would not be merged into main*, 10 March 2026 `[A]`. Four maintainers of three projects reviewed 296 agent pull requests that pass the tests: about half would be merged, against 68% of the original human patches. Main reasons: code quality, breaking other code, core functionality. Small maintainer sample; the 68% shows maintainer judgement is itself noisy.
- Older, same finding: Qi, Long, Achour, Rinard, ISSTA 2015 `[S]` (most patches from early repair tools passed tests by deleting functionality); Smith, Barr, Le Goues, Brun, FSE 2015 `[S]` (patch quality tracks the coverage of the tests used; evaluate on tests the repair tool did not see).

**They reject right solutions.**

- OpenAI, *Why we no longer evaluate SWE-bench Verified*, 2026 `[S]` (page blocked to the lab's reader; figures from search summaries that agree with each other). Of 138 problems a strong model did not reliably solve, each reviewed by six or more engineers, 59.4% had material flaws in tests or description: about 35.5% had tests enforcing implementation details the task did not ask for, 18.8% tested functionality the description never mentioned. Selected hard cases, so not a base rate.
- OpenAI, *Introducing SWE-bench Verified*, 2024 `[S]`. 93 developers screened 1,699 samples; 68.3% were filtered out for underspecified descriptions, unfair tests or other problems.

**Read together:** tests written by the people who made the change are wrong in both directions at rates that matter, roughly one in five accepted solutions being wrong on the best-studied benchmark. This is measured on popular Python libraries, on agent-written patches, with tests that were hidden from the solver.

## 2. Getting a check when none exists

**A model writes the failing test from the request.**

- Mündler, Müller, He, Vechev, *SWT-Bench*, arXiv:2406.12952 (NeurIPS 2024) `[A]`. Code agents do this better than dedicated test generators, and using the generated test as a filter doubled the precision of SWE-Agent's fixes.
- Ahmed et al., *TDD-Bench Verified*, arXiv:2412.02883 `[A]`: 449 real issues. Search summaries `[S]` put early fail-to-pass rates near 20 to 24%.
- Ahmed, Ganhotra, Shinnar, Hirzel, *e-Otter++*, arXiv:2508.06365 `[A]`: 63% average fail-to-pass rate on TDD-Bench Verified. AssertFlip `[S]`: 43.6% on SWT-Bench Verified.
- Limits: Python, mostly bug reports, and "fail-to-pass" is scored against the known human fix. A test that goes red-to-green on the reference fix can still be too narrow or too weak; these papers do not report how often.

**The known failure of generated tests.**

- Konstantinou, Degiovanni, Papadakis, arXiv:2410.21136 `[A]`. 24 Java projects. Models, like older test generators, tend to write assertions that capture what the code does now, not what it should do.
- Ma et al., arXiv:2507.06920 `[A]`, and summaries `[S]`: benchmark test suites are few and homogeneous; when the same model family writes code and tests, the errors correlate and the tests miss what the code misses.

**The requester confirms generated tests.**

- Fakhoury, Naik, Sakkas, Chakraborty, Lahiri, *TiCoder*, IEEE TSE 2024, arXiv:2404.10100 `[A]`. The system proposes tests that separate candidate solutions; the user says yes or no. 15 programmers: significantly more likely to judge generated code correctly, significantly lower reported cognitive load. Simulated users: +45.97 points pass@1 within five interactions. Single functions in Python, not repository changes. This is the closest published result to "cheap check the requester trusts".
- Endres, Fakhoury, Chakraborty, Lahiri, *nl2postcond*, FSE 2024, arXiv:2310.01831 `[S]`: postconditions from natural language are mostly correct and caught 64 historical bugs. Function level.
- Vikram, Lemieux, Padhye, arXiv:2307.04346 `[S]`: about 79% of sampled generated property assertions were sound. Library functions.

**Acceptance scenarios from a written request.**

- Ferreira, Viegas, Faria, Lima, AST 2025, arXiv:2504.07244 `[A]`. One company. 95% of generated Gherkin scenarios judged helpful; of the executable scripts, 60% usable as generated, 8% minor fixes, 24% regenerated, 8% discarded. Self-reported usefulness, not error rates.

**Asking the requester questions.**

- Vijayvargiya et al., *Ambig-SWE*, arXiv:2502.13069 `[A]`: models are poor at telling a clear request from an underspecified one, but when they do ask, performance recovers by up to 74%.
- Zhou et al., *SWE-RPG*, arXiv:2608.09072 `[A]`: recovering implicit requirements is the main bottleneck (31.5% resolution on 163 tasks).
- Gloaguen et al., *Coding Agents Don't Know When to Act*, arXiv:2605.07769 `[A]`: on 200 tasks where no change is needed, agents change code anyway in 35 to 65% of cases. A check must be able to say "nothing to do" as well as "done".
- Chen et al., *FeatBench*, arXiv:2509.22237 `[A]`: on feature requests, agents over-build and break existing features.

**A model as judge.** Search summaries `[S]` of CodeJudgeBench (ACL 2026), "Bias in the Loop" (2026) and arXiv:2508.12358: verdicts are unstable under reordering, renaming and prompt edits, and models often call correct code wrong. SWE-Judge `[S]` reports agreement near human inter-annotator level with an ensemble. Mixed; consistent with the programme keeping this parked.

## 3. What real requests ask for

- SWE-bench keeps only merged pull requests that close an issue and change tests: 2,294 tasks from about 90,000 pull requests `[A]/[S]`. Every result in section 1 is on that filtered slice. Requests without tests are, by construction, absent from the field's main benchmarks.
- Milanese et al., arXiv:2601.21194 `[A]`: in the AIDev dataset, 42.9% of human-with-agent pull requests and 40.0% of human ones include tests. So most pull requests arrive with no test change at all.
- Feature requests are under-represented and harder: 7.3% of SWE-bench is enhancements `[S]`; best success 37.72% on the verified subset of Doc2Feat-Bench (earlier name NoCode-bench), arXiv:2507.18130 `[A]`; 29.94% on FeatBench `[A]`.
- Studies of agent pull requests `[S]` (arXiv:2607.21832, arXiv:2601.20106): documentation is the most-delegated task; infrastructure, documentation and dependency changes merge above 90%; function implementation and refactoring merge far less often.
- Miserendino et al., *SWE-Lancer*, ICML 2025, arXiv:2502.12115 `[A]`: 1,400+ paid freelance tasks. To grade them, engineers wrote end-to-end tests and triple-verified them. The one benchmark built on real paid delegation had to pay experts to write the checks.

**Not found:** a published map of real requests by how they could be checked (existing test, new test, example, property, judge, requester only). Taxonomies exist by task type (bug, feature, docs, refactor), not by checkability. One session of search is not proof of absence.

## 4. What it costs the requester

Thin. TiCoder's 15-person study and the single-company acceptance-test study are the only measurements of requester effort found. Nothing found compares the effort of specifying a repository-level change by a check with the effort of doing the change.

## Open problems the field states

- Tests are a noisy grader in both directions, and benchmarks are only now measuring by how much.
- Generated tests drift toward current behaviour and share the solver's blind spots.
- Underspecification is the norm; agents neither detect it nor ask.
- Almost everything is Python, bug-shaped and library-scale. TypeScript applications and feature-shaped requests are barely covered.
