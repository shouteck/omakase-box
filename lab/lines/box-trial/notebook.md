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

## 8 October 2026: Gate 2, what real agents read before reaching the fix

**Set out to do.** Gate 2 as the CTO reset it after Gate 1b: from published run records, how much agents read before first reaching the fix, how that sits against the Box and the file filter, and where the tokens went. Report only.

**Before any sample record.** Lab level with master and origin. Confirmed the records are free: one submission in a public GitHub repository, one in the benchmark's public bucket. Looked at the record format on one task outside the sample. Wrote `gate-2-plan.md` with the agent-selection rule, the command classes, the definition of reaching and four predictions, and pushed it (`4f98f3f`).

**Did.** `gate-2/`: fetch with receipts, a command classifier with known-answer checks, measurement against Gate 1's snapshots and Gate 1b's traces, a report. 56 records measured (26 and 30). No container, no agent.

**Result.** Both agents reach the fix almost at once: median 2 and 4 steps of about 35. Little is read before that. Eight of nine failed runs had found the place.

**What the sceptic changed, which is most of the result.** It reproduced every number, then measured what the plan had not asked for: between first opening the fix and first editing, a median of 18 and 10 steps, 220 and 438 other functions read, 65% and 78% outside the Box, about two fifths of all text read. The draft's "little reading to save" became "little locating to save"; prediction 4's inference was withdrawn; the input-token share was dropped as misleading. It also found a real fault: outputs of several actions in one call were credited to the last action. Fixed, with a check; the earlier summary is kept.

**Surprise.** How early. The lead expected early; not the second step.

**Mistakes.** The lead's draft drew "small ceiling" from "found early" without looking at what the run did next. The stricter reaching rows were added after seeing numbers and are marked so.

**Cost.** Nothing paid; about 60 MB of public records downloaded; no heavy job.

**Principles that changed a decision.** *Explain the number*: asking what the other nine tenths of a run is made of is what found the stretch between finding and fixing. *Sequence verifiable units*: plan pushed before the sample was read. *Laziness, existing method first*: published records instead of live runs.

**Next.** The CTO reads the result. The lab starts nothing further in this session.


## 8 October 2026 - Gate 3, tool-only and required-start restart

Owner/CTO correction first replaced a listing with an optional box-search command: no Box data entered context unless called. Frozen tasks/model evidence preceded any repair run. Existing ChatGPT access was proved with one non-repair capability smoke; no new paid service/API key/purchase. Model GPT-5.6 Luna, high reasoning; all 24 restarted starts report that same model. Same twelve fixed tasks, controls and limits (60 commands, 1M cumulative reported tokens, 15 minutes, 300 seconds/command, 16K returned bytes).

Owner/CTO then stopped the passive design. Preserved four starts separately in gate-3/passive/: two completed Box attempts with no calls, one completed control and one owner-interrupted control with partial lower-bound usage and no evaluation. Bounded finding: a passively offered tool was not called. No passive start enters the restarted comparison. Required Box-first wording and call-validity rule were pushed at 7918335 before the first fresh restart. Control prompt remained identical. Every actual call/result/timing and following command sequence is retained; mere mentions/rejected combined commands are not actual calls.

Completed all 24 fresh starts. Ten valid Box runs; two zero-call invalids, retained without rerolls. Fifteen actual calls: thirteen no matches, two usage errors. Every valid paired task solved in both arms. Median paired token increase 41.6%, median paired step increase 4, elapsed increase 18.9 seconds including setup/protocol overhead. Three token wins/seven losses, two-sided sign p=.34375; no success discordance. All four easy pairs used more tokens. Strict no-harm and population cost claims are not established. The live control has a success ceiling; useful Box source matches were never delivered. Fixed rule: stop without repeats.

Scoring corrections were explicit and preserved originals. The earlier prepared-image exporter accidentally included unchanged pyproject.toml against HEAD; future captures checkpoint the exact prepared test-overlay worktree. Native guard descriptions in two Django tasks map uniquely to base test methods, and two truncated Matplotlib IDs map uniquely to lossless native collection. Replayed grading only; candidate hashes, agent usage and steps unchanged. First Astropy has a pristine expired leap-second-data guard failure (19/20 pass), so paired outcome unknown; no dates/warnings/task replacement. Last SymPy Box run was capped at 1,028,692 reported tokens (28,692 in-flight excess), passed native tests but remains invalid with no Box call. Total restarted repair-agent usage 5,843,839 tokens, including invalid starts; not an invoice or lead/reviewer overhead.

Reading proxies on ten valid pairs: before reach, control median 1 step/339 returned characters and Box 3/487; reach-to-recognized-edit control 5/32,916 (n=10), Box 5.5/36,635 (n=8). These are qualified source/command heuristics, not cognition, and differing edit coverage limits comparison. Returned text is capped; Python writes/views and shifted offsets can be missed.

One fresh sceptic reproduced the fixed selection and whole saved summary exactly, including cached/uncached reading equivalence; all 316 active/passive retained hashes match. Native authored fixture and a real-scope positive query passed, proving the tool can return matches. Reviewer confirmed agent queries mostly searched excluded test identifiers, absolute /testbed filters cannot match relative keys, and standalone rejection adds friction. Bounded negative claim and no-repeat decision stand; universal Box inability or higher population cost do not. Public pinned model export bytes/hash reproduced. Owned reviewer containers/scratch removed.

Principles: Model the Domain separated calls, first-command adherence and repair success; Sequence Verifiable Units froze the corrected instruction before restart and kept passive evidence separate; Prove It Works required the fresh complete replay and native positive query. No product code, new ranking techniques, Gate 1c or other lines run. Current trial stops; owner/CTO decide any new experiment.

Closeout: all selected image refs and gate containers are absent after removing only the two retained session-owned images, with non-force exact-ref receipts in gate-3/closeout-cleanup.json; no global prune. Owned calibration scratch removed after validating its resolved path and known contents. Raw scientific records remain locally under ignored files with committed hashes.

## 8 October 2026 - Gate 3b free native-search checks

Synced with accepted kitchen work: origin/master merge already up to date, no wave in flight. CTO Gate 3b is the session scope. Frozen plan c5cddfe before measurements; same twelve tasks, every real search from twelve saved controls and both published Gate 2 agents, no repair model or live pair. Built native wrappers accepting ordinary paths/arguments, compounds and pipes with full match retention; Gold is used only in scoring.

226 actions, 243 native invocations, 220 covered actions, six absent generated Sphinx environment actions unknown. Five of eleven qualified tasks satisfy the frozen halving/one-place rule; three recreated-native SymPy regressions. Stop. Modern fixture 18 and final real legacy fixture 20 cases pass; every recorded native stream preserves multiplicities. This is conditional historical-function ranking, not repair correctness. Expensive environment actions were skipped; source mutations were replayed when recognized, not a general reconstruction proof.

Instrument dead ends were saved before correction: marks before pipes could change filtering, legacy AST/end/decorator differences, early sample-only completeness, unnecessary binary reads for find. Complete unaffected old receipts retain explicit version provenance. No rule retuned, no repair tokens spent. Build the Lever changed the work into a rerunnable free instrument; Prove It Works required native fixtures and saved failure receipts rather than accepting assertions.

Fresh sceptic exactly reproduced corpus/full aggregation, all 243 stream hashes and multiplicities, fresh 17/22/48 sample invocations, and 18/20 fixtures. It materially narrowed the report: original published SymPy stream projects 3 to 3, while recreated pinned native order is 1 to 3 (same 28 matches/source). Historical generated helpers need not be required by another successful repair. Native collision attack marked an unexecuted setter sharing a getter's qualified name; 48 ambiguous names intersect seven task scopes, so marks and Gold remapping can overclaim. Unique direct SymPy identities retain the native demotion; 5/11 independently fails majority. Instrument not cleared for agent use. All mandatory wording/manifest corrections incorporated; current source hashes and prior executed-writer provenance retained separately.

No repair agent/model capability run, paid service, product transfer or live pair. Own containers/images and disposable scratch cleaned after review; evidence raw records retained with SHA receipts (closeout-cleanup.json). Next: CTO reads this bounded stop; no next experiment in this session.


## 8 October 2026 - Ideal Box reading prerequisite

**Scope.** One LAB.md session on the reopened, subsequently narrowed programme: finish its prerequisite reading and case map before building. Synced origin/master accepted kitchen documents; milestone B draft/on hold, kitchen idle. No historical experiment restarted.

**Did.** Read full main texts of ADI v1, DAIRA v5 and SWE-Doctor v1, named official tool contracts and Entire article; inspected repositories/licences and three ecosystems' coverage documentation. Broader targeted searches found AutoCodeRover, coverctl and Supercov, changing the premise that multi-language runtime tooling was absent. Wrote comparison, case map, language design and search record; frozen survey commit 7d99fa1. The reading-plan page describes this literature method, not a pre-run experiment. Public text fetched with standard-library code; no third-party code executed.

**Found.** Runtime information can help agents, but report/diagnosis gains do not establish silent navigation gains. No Kind 1 verified in this inspected set; no novelty claim. Native coverage is reusable raw material, with exactness, ordering, child-process and freshness limits. A case frequency ranking cannot be supported by the inspected public data. Stay with failing tests; reproduction script is only a later engineering extension. Open availability does not prove a never-worse repair outcome.

**Fresh sceptic.** Independently matched five retained text hashes and checked primary methods/tables and official contracts. Strong AutoCodeRover counterexample still injects hints, not silent ordinary search. Corrected SWE-Doctor comparator name and coverctl's conflicting README licence assertions; final files incorporate both. Review stands for the bounded survey, not an experimental PASS. Reviewer additionally checked AutoCodeRover's evaluated SBFL section and a coverage.py definition-line counterexample; no new experiment performed.

**Dead ends and limits.** DAIRA artifact content/licence could not be verified, ADI core has no confirmed licence, Coco support copy disagrees with June preview, some search results were unrelated. U cells mean unestablished, not absent. Authors' benchmark results are not lab replications; selected bugs do not establish prevalence. No prototype, marking repair, model trial, installation, paid service or product transfer. Retained raw text/trees ignored with committed receipts; five primary-text hashes matched.

**Principles.** Model the Domain separated silent Box, runtime facts on request and static ranking, rather than treating shared evidence as one product. Prove It Works required a fresh primary-source audit and actual receipt checks rather than accepting abstract headlines. No implementation tests were appropriate to this writing-only session.

**Next.** The programme's thirty-task prototype: correct file/start-line identity, implement/check prescribed questions and footprint, then owner page with real answers. Keep silent delivery separate from facts on request; live trial only after owner agreement/request. Reading session complete; no further session started.


## 9 October 2026 - Failing-test Box prototype and owner design

**Scope.** One prescribed LAB.md session after the completed reading prerequisite. Synced origin/master; accepted kitchen work already merged, kitchen idle and milestone B draft/on hold. Plan 7b1ab2f pushed before checks. No live repair agent, model pair, paid service, product change or widening of scope.

**Instrument.** Python helper validates repository-relative file and code/definition starting line against one unique parsed definition/code name and matching source hash. Decorators, repeated accessors and nested definitions are handled by identity; pseudo-functions, patched test sources and stale/missing/ambiguous evidence give no priority. Ordinary command/pipeline completes first; the display hook then preserves native records, stderr and exit. Order-only adds zero instruction/answer bytes. The whole repository remains available; the prototype corpus searches stored Python sources, not complete prepared repositories.

**Measurements.** Thirty frozen tasks, 29 valid traces and one missing execution (ordinary fallback). 587 native literal searches from fixed words and 243 retained native invocations across twelve tasks; the latter re-annotated, not re-executed. All native record multiplicities preserved. Historical target rank medians conditional on reaching: 96→4.5 for literal words, 3→1 for saved-agent invocations; 102/3 and 22/3 wins/losses. Actual saved-agent median prefix-saving proxy is zero. Badges add 84,555 and 1,875 bytes over all queries; 200 and 53 queries have negative net-prefix proxies. Recommend ordering alone, no routine badges. Complete output still returns: no actual model-token, cognition, repair-success or never-worse claim. Original figures remain after full post-review re-presentation of all 830 streams with verified input hashes.

**Separate facts illustration.** Pinned Django 12193, named failing test, only test overlay, owned isolated network-off container. File answer: 14 definitions/670 bytes. Ordered route excerpt: nine events/598 bytes, eight others explicitly omitted. Three get_context calls/returns then AssertionError at test line 96; repository-only sequence, not complete libraries/children or causal diagnosis. Initial collector cost 14.953s vs 1.359s plain; path caching and selected-test local tracing reduced this to 1.703s vs 1.203s. Call key/name set (2,066) and 17 selected-test semantic events match; 271 global first-seen ordinals differ across fresh processes. One example, no general timing or efficacy claim. Both original and corrected evidence retained.

**Development surprises.** Fixture-author assumptions about return-line matches and matching filter exit were wrong; failed scripts retained and expectations corrected against native output. Full trace-dictionary equality failed because first-seen ordinals vary; compare semantic call sets/events, retain differences. Initial measurement launched after a fixture failure due a batch lacking fail-fast; results stayed preliminary until corrected fixtures passed. New numeric-only fixture omitted kind=line and was corrected without changing assertions; original script retained. Two document-writing attempts failed before the complete d18fca2 candidate was frozen. Post-review frozen-stream recheck started before its fresh kitchen probe; in-run probe was idle, and subsequent timing job had an idle probe before execution. No runtime expected bug/test outcome changed.

**Fresh sceptic.** Exact d18fca2 sample: 22 new native literal searches, 70 saved invocations, all 587 original hashes/conservation, footprint arithmetic and facts. It found real faults: multiline matches split by line ordering, and captured path overriding an explicit native filename. Corrected to intact multiline fallback and native filename/path agreement, with one-file requirement for number-only records. Eleven added checks include the actual native crossing-definition counterexample; original 13+4 checks pass. Original adapter/summary/footprint/receipts preserved. Corrected exact 9baf469 then received targeted verification by the same independent sceptic; see its follow-up for actual reruns and standing. This closes one review pass, not a new experiment.

**Principles.** Model the Domain changed the identity representation from qualified name to exact source/code-start evidence and separated ordered events from first-seen sets. Prove It Works required native pipelines, the real failing-test facts answer and adversarial review; passing conservation alone did not prove a multiline match remained intact.

**Closeout and next.** Owned containers and exact newly pulled image ref absent; disposable resolved scratch removed, all source-bearing scientific raw receipts retained. Owner design page is the deliverable. Await owner agreement and explicit request before any capped live pair. Original Gate 3b stop and faulty historical instrument remain recorded; this is a checked research prototype, not production integration. Other lines remain paused; no second session begun.


## 9 October 2026 - One silent Box live pilot

**Scope and freeze.** One owner-authorized pair only, then stop and fresh review. Kitchen idle; accepted master already merged, milestone B draft/on hold. Sphinx 10614 selected before safeguards because both published agents failed and the earlier high-effort control used 719,483 tokens. Same GPT-5.6 Luna low effort, existing allowance, byte-identical prompt/base/tool schema, full repository, no Box instruction/marks/facts tool. No new purchase/key or product change. Plan/source lock 95083b1 pushed before two repair starts; 400,000 tokens/run, 800,000 total, 60 commands, 900 seconds, 300 seconds/command, common 16 KB return cap.

**Safeguards and dead ends.** Gold production patch scores solved through prepared-overlay checkpoint/export/fresh evaluation; empty patch fails; production guard-breaking patch fails guards. Fresh failing-test trace has 1,698 call keys. Whole-command display avoids changing upstream pipes. Exact unwrapped native comparisons exposed executable-name/locale differences and interception of unavailable rg; corrected with originals preserved, no repair agents yet. Final 31 real search-containing commands/34 available searches/six reorderings preserve exits, stderr and stdout multiplicities. Missing native prerequisites remain native errors. Earlier 35-capture replay is explicitly superseded by final available-tool count. No expected benchmark outcome changed.

**Observed pair.** Control completed 14 commands/eight native searches/200,832 cumulative tokens; Box ten commands/five searches/182,429. One Box search changed order: base-builder get_relative_uri second to first among four definitions, next command explicitly opened lines 135-165. Actual reordered tool text delivered, no metadata injected, zero added bytes and full native records conserved before the common ceiling. Total 383,261, no cap excess, reroute, timeout, search error or wrapper rejection. Normal test failures and one no-match search per arm retained. Both patches fail the named SVG test and pass all five guards. Smaller Box figures are descriptive only, no savings/causation/superiority claim.

**Fresh sceptic.** Clean aeb977e candidate; both complete records reread, both actual saved patches independently rescored in own network-off containers: named test 0/1, guards 5/5. Verified actual delivered text, source identity, stale/name/code-start attacks, both manifest sets, identical settings and accounting; independently replayed promoted search vs native bytes. Narrow integration claim stands. Required wording correction two definitions to four incorporated; original remains in Git. Box step 2 truncated at shared cap, promoted step 5 not truncated. No agents rerun.

**Limits and principles.** One public task and pair, control first, no noise estimate, possibly memorized code; subsequent open is not evidence of cognitive use or causation. Bounded shell interception, unsupported/context fallback, explicit executable/Python bypasses. Sequence Verifiable Units changed the launch into enforced pre-agent gates and pushed source lock; Model the Domain separated delivered reordering, subsequent open and repair outcome; Prove It Works required native bytes and fresh scoring of the actual failed patches. All records, including instrument faults, retained.

**Closeout.** Reviewer containers removed; exact newly pulled pinned image removed non-force with absence verified using first preserved absent-to-pull receipt, not later overwritten cached ownership. Two verified empty own scratch directories removed; scientific raw retained with hashes. One session closed. No more pairs, other lines or product work; await the owner's word for any separately planned comparison.
