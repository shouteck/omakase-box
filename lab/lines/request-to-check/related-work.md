# Related work: from a request to a check

Surveyed 6 October 2026 (session 1). Zero cost: web search and open-access abstracts only.

**How each source was read.** `[A]` the abstract or page was fetched and read this session; numbers are quoted from it. `[S]` known only from a search-result summary; treat the number as a lead, not a fact, until someone opens the paper. Nothing here was read in full by the lab lead. `[V]` the sceptic re-opened the source after the first draft and the entry was corrected to match; see `sceptic-survey.md`. Anything not marked is the lab's inference.

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

- Wang, Pradel, Liu, *Are "Solved Issues" in SWE-bench Really Solved Correctly?* arXiv:2503.15223 `[A]`. Three issue-solving tools on SWE-bench Verified. `[V]` 7.8% of patches counted correct fail the developers' full test suite (SWE-bench runs only part of it); differential testing shows 29.6% of test-passing patches behave differently from the human fix. Different is not wrong: only 28.6% of those divergent patches are certainly incorrect, about 8.5% of test-passing patches. Resolve rates are inflated by 6.2 points.
- Yu et al., *SWE-ABS*, arXiv:2603.00520 `[A]`. `[V]` After strengthening tests adversarially, 19.71% of previously passing patches from the top-30 agents are rejected (19.78% in the body: 2,184 of 11,041); the top score falls from 78.80% to 62.20%. Caveats from the full text: the stronger tests are written by a model and anchored on the human fix; on 53 of 500 tasks they wrongly rejected valid fixes, and excluding those the figure is 15.2%; only 100 rejections were checked by hand. So this is an upper-end estimate, and it is the share of accepted patches later rejected, not a rate over all wrong patches.
- Yu, Zhu, He, Kang, *UTBoost*, arXiv:2506.09289 `[A]`. Augmented tests expose 345 patches wrongly labelled as passing; 36 tasks had insufficient tests.
- Aleithan et al., *SWE-Bench+*, arXiv:2410.06992 `[A]`. On the original SWE-bench, about a third of SWE-Agent+GPT-4's successes were "suspicious" because of weak tests, and about a third had the answer in the issue text.
- METR, *Many SWE-bench-passing PRs would not be merged into main*, 10 March 2026 `[A]`. `[V]` Four maintainers of three projects reviewed 296 agent pull requests that pass the tests. Raw: roughly one-third to one-half would be merged, against 68% of 47 original human patches. The headline "about half" is already adjusted for that 68% baseline, so the two must not be quoted side by side. Main reasons for refusal: code quality, breaking other code, core functionality. In the other direction the note found the tests rejecting a valid patch on only 1 of 27 issues.
- Older, same finding: Qi, Long, Achour, Rinard, ISSTA 2015 `[S]` (most patches from early repair tools passed tests by deleting functionality); Smith, Barr, Le Goues, Brun, FSE 2015 `[S]` (patch quality tracks the coverage of the tests used; evaluate on tests the repair tool did not see).

**They reject right solutions.**

- OpenAI, *Why SWE-bench Verified no longer measures frontier coding capabilities*, 2026 `[V]` (page blocked to the lab lead's reader; the sceptic read it through a free proxy). Of 138 problems o3 did not consistently solve over 64 runs, each reviewed by six or more engineers, 59.4% had material flaws in tests or description: about 35.5% had tests enforcing implementation details the task did not ask for, 18.8% tested functionality the description never mentioned. Selected hard cases, so not a base rate.
- OpenAI, *Introducing SWE-bench Verified*, 2024 `[V]`. 93 developers screened 1,699 random samples; 68.3% were filtered out, and 61.1% were flagged for tests that may reject valid solutions. Because the sample is random, this is the better evidence that the risk of false rejects is common; it is a flag by annotators, not a count of valid solutions rejected.

**Read together:** tests written by the people who made the change are wrong in both directions. How often they accept wrong work depends heavily on the method used to find out: estimates on SWE-bench Verified run from about 1% (UTBoost's added tests) through about 8% (certainly incorrect, by differential testing) to 15 to 20% (model-strengthened tests). The false-reject side is shown to exist and is widely flagged by annotators, but is not measured as a rate on real solutions; METR's one direct look found it rare (1 of 27). All of this is on popular Python libraries, agent-written patches, a subset of each pull request's tests, hidden from the solver.

## 2. Getting a check when none exists

**A model writes the failing test from the request.**

- Mündler, Müller, He, Vechev, *SWT-Bench*, arXiv:2406.12952 (NeurIPS 2024) `[A]`. `[V]` Code agents do this better than dedicated test generators. Using the generated test as a filter doubled the precision of SWE-Agent's fixes to 47.8%, but at 20% recall: the filter threw away about four in five correct fixes, and over half of what it kept was still wrong.
- Ahmed et al., *TDD-Bench Verified*, arXiv:2412.02883 `[A]`: 449 real issues. Search summaries `[S]` put early fail-to-pass rates near 20 to 24%.
- Ahmed, Ganhotra, Shinnar, Hirzel, *e-Otter++*, arXiv:2508.06365 `[A]`: 63% average fail-to-pass rate on TDD-Bench Verified. AssertFlip `[S]`: 43.6% on SWT-Bench Verified.
- Limits: Python, mostly bug reports, and "fail-to-pass" is scored against the known human fix. A test that goes red-to-green on the reference fix can still be too narrow or too weak; these papers do not report how often, so 63% is not "a usable check 63% of the time". Rates from different benchmarks are not a trend line.

**The known failure of generated tests.**

- Konstantinou, Degiovanni, Papadakis, arXiv:2410.21136 `[A]`. 24 Java projects. Models, like older test generators, tend to write assertions that capture what the code does now, not what it should do.
- Ma et al., arXiv:2507.06920 `[A]`: benchmark test suites are few and homogeneous, so subtle faults pass. That errors correlate when the same model family writes code and tests is from search summaries `[S]` only, not this abstract.

**The requester confirms generated tests.**

- Fakhoury, Naik, Sakkas, Chakraborty, Lahiri, *TiCoder*, IEEE TSE 2024, arXiv:2404.10100 `[A]`. The system proposes tests that separate candidate solutions; the user says yes or no. `[V]` 15 programmers on 3 small Python tasks: correct judgement of generated code rose from 0.40 to 0.84 with the yes/no variant (significant); the variant where users supply the expected output (0.64) was not significant, and neither was time taken. The +45.97 points pass@1 comes from a simulated user who answers from the reference solution, so it assumes a requester who is never wrong. The authors say it may not scale. Closest published result to "a cheap check the requester trusts", and weak evidence for it.
- Endres, Fakhoury, Chakraborty, Lahiri, *nl2postcond*, FSE 2024, arXiv:2310.01831 `[S]`: postconditions from natural language are mostly correct and caught 64 historical bugs. Function level.
- Vikram, Lemieux, Sunshine, Padhye, arXiv:2307.04346 `[S]`: a search summary gives about 79% of sampled generated property assertions as sound; the current abstract instead reports that the model covered 21% of documented properties. Library functions.

**Acceptance scenarios from a written request.**

- Ferreira, Viegas, Faria, Lima, AST 2025, arXiv:2504.07244 `[A]`. One company. 95% of generated Gherkin scenarios judged helpful; of the executable scripts, 60% usable as generated, 8% minor fixes, 24% regenerated, 8% discarded. Self-reported usefulness, not error rates.

**Asking the requester questions.**

- Vijayvargiya et al., *Ambig-SWE*, arXiv:2502.13069 `[A]`: `[V]` models are poor at telling a clear request from an underspecified one; when they do interact, performance improves by up to 74% over not interacting.
- Zhou et al., *SWE-RPG*, arXiv:2608.09072 `[A]`: `[V]` recovering implicit requirements is a key bottleneck, affecting roughly a quarter to a half of runs (31.5% average resolution on 163 tasks).
- Gloaguen et al., *Coding Agents Don't Know When to Act*, arXiv:2605.07769 `[A]`: on 200 tasks where no change is needed, agents change code anyway in 35 to 65% of cases. A check must be able to say "nothing to do" as well as "done".
- Chen et al., *FeatBench*, arXiv:2509.22237 `[A]`: on feature requests, agents over-build and break existing features.

**A model as judge.** Search summaries `[S]` of CodeJudgeBench (ACL 2026), "Bias in the Loop" (2026) and arXiv:2508.12358: verdicts are unstable under reordering, renaming and prompt edits, and models often call correct code wrong. SWE-Judge `[S]` reports agreement near human inter-annotator level with an ensemble. Mixed; consistent with the programme keeping this parked.

## 3. What real requests ask for

- SWE-bench keeps only merged pull requests that close an issue and change tests: 2,294 tasks from about 90,000 pull requests `[A]/[S]`. Every result in section 1 is on that filtered slice. Requests without tests are, by construction, absent from the field's main benchmarks.
- Milanese et al., arXiv:2601.21194 `[A]`: in the AIDev dataset, 42.9% of human-with-agent pull requests and 40.0% of human ones include tests. So most pull requests arrive with no test change at all.
- Feature requests are under-represented and harder: a search summary gives 7.3% of SWE-bench as enhancements `[S]`, which the sceptic could not find in the paper it was attributed to; best success 37.72% on the verified subset of Doc2Feat-Bench (earlier name NoCode-bench), arXiv:2507.18130 `[A]`; 29.94% on FeatBench `[A]`.
- Studies of agent pull requests `[S]` (arXiv:2607.21832, arXiv:2601.20106; not in either abstract, unverified): documentation is the most-delegated task; infrastructure, documentation and dependency changes merge above 90%; function implementation and refactoring merge far less often.
- Miserendino et al., *SWE-Lancer*, ICML 2025, arXiv:2502.12115 `[A]`: 1,400+ paid freelance tasks. To grade them, engineers wrote end-to-end tests and triple-verified them. The one benchmark built on real paid delegation had to pay experts to write the checks.

**Not found:** a published map of real requests by how they could be checked (existing test, new test, example, property, judge, requester only). Taxonomies exist by task type (bug, feature, docs, refactor), not by checkability. One session of search is not proof of absence.

## 4. What it costs the requester

Thin for generated checks at repository scale, but not empty; the first draft said more was missing than is. Found by the sceptic at search-summary level; read in session 3 where marked `[F]`:

- Staats, Hong, Kim, Rothermel, ISSTA 2012 `[F]` (full text read, session 3; open copy at orbilu.uni.lu). 30 students in two studies at two Korean universities judged generated invariants for three small Java programs as correct or incorrect. Depending on the program, they wrongly approved 26.1% to 58.6% of the incorrect invariants on average, and wrongly rejected 9.1% to 31.7% of the correct ones (the introduction gives 39.8% as the upper figure; the abstract and conclusion give 31.7%). Program complexity did not explain who struggled. The authors expected people to reject correct statements rarely and were surprised. Limits for this line: invariants over code, not tests or examples; students new to the programs, not owners who know their own system. Still the most direct evidence that a person's yes to a machine-written check is unreliable in both directions.
- Fraser, Staats, McMinn, Arcuri, Padberg, TOSEM 2015: 49 subjects; generated tests raised coverage but not the number of bugs people found.
- Barr, Harman, McMinn, Shahbaz, Yoo, *The Oracle Problem in Software Testing: A Survey*, IEEE TSE 2015 `[F]` (full text skimmed, session 3; open copy at discovery.ucl.ac.uk). Sorts the field into specified oracles, derived oracles, implicit oracles (crashes and the like) and the case with none, where a person decides. Splits the human's cost into two: writing the oracle, and judging outcomes. Work on reducing it is either quantitative (fewer, shorter things to check) or qualitative (making each easier to understand). This line's requester cost (lines written, items read) is the same split.
- Ricca, Torchiano, Di Penta, Ceccato, Tonella, IST 2009 `[A]` (abstract on an author's page; the paper is behind a paywall). Two experiments with students: acceptance tests written as tables helped them understand requirements without significant extra effort. This is about reading tests to understand a requirement, not about a requester writing or confirming them, so it bears on the recipient's side more than the requester's.
- Melnik, Maurer, Chiasson, AGILE 2006: could not be obtained. The university repository serves the thesis that contains it only through a page the lab's tools cannot read. Unread.
- Liang et al., arXiv:2609.12012: a survey of 87 test-driven LLM approaches.

Still not found: a comparison of the effort of specifying a repository-level change by a check with the effort of doing the change.

## Open problems the field states

- Tests are a noisy grader in both directions, and benchmarks are only now measuring by how much.
- Generated tests drift toward current behaviour and share the solver's blind spots.
- Underspecification is the norm; agents neither detect it nor ask.
- Almost everything is Python, bug-shaped and library-scale. TypeScript applications and feature-shaped requests are barely covered.
