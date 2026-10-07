# A-replay-1: formulation and preregistration

Version 1, 7 October 2026. This session formulates the question and freezes a metadata-only candidate pool. No production fix is read, no selector is scored and no project is executed. Freeze requires a fresh sceptic's disposition and a Git commit containing this protocol and the candidate IDs. The final test-ready task manifest is a later gate, not claimed complete here.

## Question and scope

For a fixed rule, how often does a small package from a base repository reproduce the chosen failing example and contain the historical production change, with permitted new paths and necessary reading context recorded separately? This is an empirical replay of maintainers' changes. It is not a proof that all repairs fit, that an omitted historical file is essential, that tests fully specify an issue, or that an isolated solver succeeds. The latter is Line D.

A task is `(repository, merged PR, base commit, fixed commit, pre-fix request, test overlay, declared commands, task class)`. A rule sees only base production files, the test overlay and declared entry points. The overlay may contain the maintainers' added/changed tests and test fixtures; it may not silently carry fixed production code. The rule never sees the production diff, changed-file list, fixed runtime trace or a fix-derived source-root choice. Requests are the issue text/comments published before the fix; PR descriptions that reveal implementation are not solver requests.

The implementation under study selects whole files. This measures file-level module/trace heuristics, not a statement-level sound program slice. All four rules get the same setup/test/environment information and the same test overlay. No content is withheld by subtracting from a full-repository starting selection; rules grow from the example, as the owner requires.

## Claims and endpoints

For each case/rule record independently:

| Claim | Score | What it does not establish |
|---|---|---|
| Base failure reproduced | `same-observed-failure`, `different`, `setup-error`, `unstable`, `unknown` | Same root cause or complete task specification |
| Historical existing production edits contained | Exact pre-fix path set is a subset of selected editable production paths; report intersecting count too | Necessity of the historical patch, or existence/nonexistence of alternative repairs |
| Historical new production paths permitted | Each new path permitted under the frozen creation policy below | Availability of its content before solving |
| Reading/reuse context | Omitted file classified `essential-for-reference`, `replaceable`, `unknown`; evidence and reader named | All-solution necessity or actual solver success |

Also record all patch categories separately: existing source, new source, configuration/build, runtime data, generated artifacts, tests/fixtures, documentation, rename/deletion. Renames count as deletion of the old path plus creation of the new. A production edit outside the registered package root is not excluded from containment just because it is inconvenient.

`reference-feasible` requires existing non-test edits permitted, new non-test paths permitted, and the full historical production patch applying and passing the fixed behavioural/guard checks inside the package. This is a replay outcome, not a solver outcome. If it cannot be applied, containment failure remains recorded; no local rewrite is invented to rescue the score. Permissions for deletions apply only to selected editable files.

## Project panel and sampling frame

Chosen for two source languages and small library entry points, not known replay success. Primary repository metadata and directory listings checked 7 October 2026, without task content:

| Repository | Source language | Fixed production root | Test-path family for overlay extraction |
|---|---|---|---|
| `sindresorhus/ky` | TypeScript | `source/` | `test/`, `test-d/` |
| `colinhacks/zod` | TypeScript | `packages/zod/src/` excluding test-path matches | any `__tests__/` or `tests/` segment, files ending `.test.ts` or `.spec.ts` |
| `pallets/click` | Python | `src/click/` | `tests/` |
| `pallets/itsdangerous` | Python | `src/itsdangerous/` | `tests/` |

If that root does not exist at the base, label `unsupported-base-layout`; do not choose a new root from the patch. Configuration is not source; new runtime data belongs to a separate category. Workspace siblings and production paths outside the root remain relevant to patch scoring and total disclosure.

Use GitHub public issue-search metadata only: `repo:<repo> is:pr is:merged created:2026-01-01..2026-09-30 merged:2026-01-01..2026-09-30`, sort `created` ascending, first page with 100 rows. Record `total_count`, `incomplete_results`, metadata timestamps, user type and IDs, but no titles, bodies, comments, diff text or changed-file names. Locally sort by `(created_at, numeric PR number)` and remove users of type `Bot` or login ending `[bot]`. Take the first 20 remaining rows per repository; freeze fewer if fewer exist. If search is incomplete or the 100th-row timestamp ties with the cutoff row's timestamp, the snapshot is not admissible: resolve pagination before freezing, without reading task content. Record the 100-row cap's convenience bias. Do not expand dates/projects after seeing task readiness or selector scores.

Positions 1–5 per project are development candidates; positions 6–20 are confirmation candidates. IDs/URLs/dates are visible now; confirmation request/test/source content remains unread until the instrument and rule implementations are committed and mechanically checked using development only. Pre-existing R3b, outside-sample-1 and any case already read by the researcher are marked `previously-exposed` and excluded from confirmation. If this removes a candidate, its position is not refilled. This is an ordered convenience panel, not a probability sample of software tasks.

### Admission and final task freeze

In each confirmation list, in frozen order, admit the first three cases meeting all criteria below, at most 12 cases total (three per project). Examine up to the 15 candidates; each exclusion has a reason. Do not replace an admitted case after seeing any rule score. If fewer than three qualify, report the shortfall rather than selecting from another project/window. Cases beyond the first three eligible are not scored in A-replay-1.

Admission may use metadata, issue content and test-only diffs. It may run full base/fixed snapshots in containers, but the selector developer does not inspect fixed production content. The metadata/test extractor must discard production diff text before exposing output. The final per-case base/fixed/test/command manifests are committed before any selection result or production-patch reveal for any confirmation case. This is a second freeze distinct from this candidate-pool freeze.

1. Public merged human PR with a linked pre-fix issue/request describing observable runtime behaviour. Exclude dependency-only, docs-only, formatter-only and pure typechecker/toolchain changes by request/test content and metadata, not by whether the selection is small.
2. Base is the first parent of the accepted merge/squash commit; fixed is that accepted commit. Missing/ambiguous parentage is `unresolved-provenance`, not inferred from current main. Freeze actual SHAs and commit dates.
3. A test-only overlay is identifiable in the fixed change using the frozen path families. Fixtures declared by that test may be included; any path outside the test family requires independent test-only justification and review before selector runs. If it imports implementation added by the fix, keep that absent import as the feature's failure rather than copy its content.
4. Declared behavioural command fails on base+overlay and passes on fixed+overlay in three fresh-process runs each, with stable failure identity and no setup failure. At least one unchanged relevant guard passes on both, also three runs. Pure loader failure for an extension/new feature is allowed and tagged `missing-feature-entry`; existing-bug cases require a behavioural assertion/error after setup succeeds. A new request with no runnable example is `no-runnable-example`, not manufactured from the solution.
5. Classify before selector scores: `bug`, `extension`, `new-component`, `ambiguous`. The request defines classes: correction of already claimed behaviour; new behaviour using an existing entry; new API/component. Mixed/unclear remains ambiguous and is reported separately. No class is dropped to improve rates.
6. Existing zero-cost tooling can execute it with no install hooks and within the resource cap below. Record environment/dependency failures separately. Do not infer readiness from upstream green badges.

This selection conditions on a runnable test and favours libraries. It cannot estimate performance on ordinary open issues. Recent dates do not establish freedom from model training leakage: exact solver cutoff is unavailable; Line D must record actual model information and known prior exposure, not call these tasks unseen.

## Frozen file rules

All seed/edge resolution operates on base+test overlay. Built-in and installed external dependencies are environment inputs, not copied repository production source. Copy whole selected files unchanged; deduplicate by canonical relative path, refuse escaping symlinks, preserve case collision errors. A Python package initializer or TypeScript barrel is ordinary source and counts toward disclosure.

**E — executed files.** Union of repository production files with at least one executed statement during the three admitted failing-example runs. Use Python `coverage.py` statement events and Node V8 precise coverage mapped through verified source maps to original TS files. A file merely loaded without an executed statement is not an E seed; attempted absent paths are separately recorded. If source maps cannot be verified on a development fixture, that adapter is unsupported and no guessed source mapping is scored. Runner/test/setup coverage does not seed unrelated production. Report instrumentation overhead; a trace that changes the failure is invalid.

**EI — E widened by imports.** E plus the transitive closure of statically resolved local module dependencies from every E file. Parse TS imports/re-exports and literal `require`/`import()` using TypeScript 6.0.3's compiler API and the base tsconfig/module resolver; parse Python imports using stdlib `ast`, resolve relative/absolute local modules under the frozen project root, include enclosing package `__init__.py`, and include locally resolved `from package import submodule` targets when present. Star import resolves the module, not a fabricated complete attribute graph. Type-only TS imports count as read context and disclosure. Include re-exports. A nonliteral dynamic import, eval-generated import, ambiguous resolution or namespace/external edge is listed unresolved; never silently declared absent or sound. No automatic whole-root fallback.

**R — reachable module files from the example.** Transitive closure under the same static module graph from the visible behavioural test entry module(s), traversing every resolved local import, including imports in unexecuted test/helper modules and unexecuted branches. Every reachable production target is selected even when no statement ran. Test/helper modules are traversed but counted in test disclosure rather than production. It is a module-reachability proxy for the programme's reach rule, not a whole-language call/dependence guarantee. Dynamic edges remain explicit unknowns. Calls inside an already selected file are retained because selection is whole-file; no heuristic name search adds unrelated files. This may equal EI on some cases; report equal sets rather than pretend distinct conditions.

**G — generous baseline.** Every tracked non-test production file under the registered root, plus the common packaging rules. It may still miss required workspace siblings/configuration; it is not the entire repository control. Show failures rather than widen it using the fix.

These are the mandatory simple baselines. Predicate-switching/implicit dependence, formal slicing and Trailmark are surveyed alternatives; they are not quietly treated as implemented A-replay-1 rules. Any later rule change starts a new protocol/cohort. Line D's whole-repository, hinted-repository, neighbour and oracle conditions stay distinct and are not introduced into A's selector scores.

## Packaging, authority and disclosure

Record three sets independently: the selected source core, additional base files needed to execute the check, and optional reading context. Build closure is produced by a frozen algorithm, not manual patch-driven additions:

- Same test overlay/check scripts/fixtures for every rule, immutable to the solver. Include base package/lock/config files and local manifests needed by the declared script-disabled setup. Record this explicit allowlist in the per-project development adapter before confirmation content is opened.
- From a base run, trace local file reads and directory/existence queries during setup and the behavioural/guard commands. Trace these in the container; record absent paths and directory listings as state, not imaginary file bytes. Add non-production repository inputs actually read. If a read requires production outside the core, classify `required-production-expansion`; report the raw core failure and the expanded runnable package separately. Never let expansion silently repair an E/EI/R score.
- No arbitrary README or other source folder is included as optional context. A rule may identify source names outside its core as unresolved context; only separately frozen optional-context variants may ship them. The primary variant has no optional reading expansion.
- Selected production source and included necessary runtime/config data are editable; tests, harness, dependency locks and authority manifests are immutable. A historical change to an immutable file is a reference-feasibility failure, even if its content is shipped. The owner verifies independently against pristine manifests.
- New files may be created beneath the frozen production root, excluding test-path families and symlink escapes; declaration of a directory permits a path, not its contents. New source outside that root, new configuration outside it and newly discovered runtime data outside it are not automatically permitted. This authority rule is common to all four conditions. Record potentially broad creation authority separately from actual disclosure.

Freeze denominators mechanically from the base tracked-path manifest before selecting files. The operational source universe is every tracked file ending `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py` or `.pyi`, except frozen test-path families, throughout the repository (including sibling packages and build scripts). Generated tracked source counts too: this deliberately avoids a subjective hand-authored/generated exclusion. Tracked build outputs count if they have these extensions; downloaded/untracked outputs do not. Also report the same file/byte fractions against source within the registered production root, so unrelated siblings cannot dilute disclosure. For that root fraction, the numerator is shipped source inside the root; out-of-root source stays visible in the repository fraction and its absolute count. If either denominator is zero, size is unknown, not zero. This is an operational source measure, not a count of every possible programming language.

The total-repository denominator is all base tracked files including tests, configuration and generated artifacts. Report total copied base file/byte fractions, external dependency name/version/count separately, and all transmitted test-overlay/new-harness bytes as absolute additions. Fractions use raw bytes, not LOC. Include all shipped base source, including expansions and build source, in the applicable source numerators. A package that can reach the owner repository, host mounts, Git history, source caches or network is not isolated.

The primary condition is raw rule core plus the common non-production packaging closure, without optional context or additional production source. An expanded runnable package is a separately labelled diagnostic condition and cannot rescue the primary screening score, even if its final size is small. Report its full disclosure too.

## Size threshold and decision rule

Predeclared operational threshold, chosen by the lab for a useful first reduction, not from customer evidence: a package is **small** only if its file AND byte fractions are at most 25% against BOTH operational source denominators above. It is **nearly everything** at 75% or more in any of those four measures. Values between are reported as partial reduction. Small repositories are not excused; shipping one of three files fails 25%. Show the continuous fractions so the arbitrary threshold is visible.

For each task class and project report counts, not a pooled customer success rate. All twelve rows, if available, are a descriptive summary only; clustering and convenience selection prevent population inference. Report a binomial Wilson interval as an explicitly hypothetical independent-case sensitivity calculation, never as confidence about all repository tasks. With only three cases per project/class cells, uncertainty is large. Even 12/12 is insufficient for a 95% reliable product promise.

**Promising for a larger study:** at least one fixed rule's PRIMARY condition has three reference-feasible small cases in each of all four projects (12/12), with `same-observed-failure` in all three paired base runs, and no omitted `essential-for-reference` file and no `unknown` reading/reuse label in those rows. Replaceable omissions require recorded evidence and sceptic agreement; they are not all-repair necessity findings. This is a stringent screening decision, not a proof or an MVP approval. **Revise rule:** coverage is obtained mainly at the generous baseline or size misses; investigate misses without tuning on confirmation. **No demonstrated promise / incomplete:** missing cells, setup/adapter errors, unresolved context or fewer than 12 admittees prevent that screen from passing. A single counterexample disproves a universal promise but does not establish uselessness.

Before admission, each development adapter freezes a failure-identity schema: exit status, assertion/error category, and relevant expected/actual behavioural values. Only declared nondeterministic fields (for example temporary absolute paths) may be normalized identically in full and package output; never remove output differences after seeing a mismatch. Admission manifests record the actual identity and normalization version before selector runs. Stable but different observations cannot pass reproduction.

Missing observations remain unknown in coverage tables and count as not-demonstrated in the screening decision. Never condition rule rates only on successful exports. A selector error gets its own failure row; setup readiness excludes a task before selection by the common admission gate, with exclusion counts shown. Failure reproduction and patch containment are scored even when the other endpoint fails.

## Execution cap and versions

No project code runs in this formulation session. Later, third-party code runs only in disposable named containers with network disabled for executions, no secrets/owner checkout mounts, nonprivileged user and bounded CPU/memory. Dependencies may be fetched at zero cost in a separate preparation step with install scripts/hooks disabled; unavailable cached dependencies are an environment outcome. Python build-backend execution is code execution too: perform it only inside the container and require explicit recorded setup, never describe `pip install` as inherently script-free.

Before each heavy job run `node lab/tools/kitchen-busy.mjs`; do one at a time. Use `lab-a-replay-1-*` resources and free ports, never 4000/4001. Per candidate: at most two documented environment-correction attempts, 30 minutes of setup attempts combined, 120 seconds per behavioural/guard execution, 4 GB RAM and two CPU cores maximum. Resource failures remain exclusions. Do not drop a case after a selector runs. Refuse any needed paid resource.

Development must freeze container image digests, coverage/source-map adapters and versions, package manager lock hashes, Python parser/runtime version and per-project configuration allowlists BEFORE opening confirmation content. These details are not asserted ready in version 1: instrument stage must produce an implementation supplement limited to the rules above. A semantic change to a rule requires version 2 and a fresh confirmation cohort, not a silent adapter tweak. The final task manifest likewise precedes scoring/reveal. This session's freeze is the question, rules, sampling frame and thresholds, not an executed benchmark.

Repeat base/fixed runs three times during admission; per rule run three base package observations and one reference-patch replay plus relevant guard run, with a second replay only on a recorded anomaly. No optional additional runs to improve the denominator. Save raw outputs, timestamps, versions, paths, hashes and run status. A fresh sceptic independently reproduces at least one case per project when replay happens, and attacks missing-file necessity labels without receiving an oracle patch before the blind selection stage closes.

## New primary reading

Zhang, Tallam, Gupta and Gupta, *Towards Locating Execution Omission Errors*, PLDI 2007: the paper detects implicit dependence by switching predicates and reexecuting, but its soundness discussion explicitly admits missed dependencies involving nested predicates. Selected sections read: introduction, Definition 2, algorithm caveats and section 5 soundness. It is a fault-localisation alternative, not a future-repair guarantee. [Author-hosted paper](https://www.cs.ucr.edu/~gupta/research/Publications/Comp/pldi038-zhang.pdf).

Le Goues et al., *A Systematic Study of Automated Program Repair*, ICSE 2012: fault localisation chooses mutation destinations; fix localisation chooses donor code separately, with insertion/deletion/replacement as a restricted search space. Selected sections read: introduction, patch representation, fault/fix localisation and mutation operators. That distinction explains why editing scope and reading/reuse scope require different scores. No repair rate or modern-language applicability is imported. [Author-hosted paper](https://squareslab.github.io/papers-repo/pdfs/weimer-icse2012-genprog-preprint.pdf).

Principles applied: Model the Domain separates claim fields and unknowns; Sequence Verifiable Units creates two freeze gates before scoring; Make Operations Idempotent requires immutable snapshots, explicit restart rules and logged attempts rather than changing the cohort on retries.

## Review

Fresh review and author disposition are recorded in sceptic-formulation.md and the notebook. The author drafted the sampling frame before obtaining candidate IDs; no confirmation request, test or fix content was fetched by the collector. Later denominator/failure-identity wording corrections respond to the sceptic, not case outcomes.

### Candidate-pool freeze outcome

The immutable [metadata snapshot](replay-1/candidate-metadata.json) and [collector](freeze-candidates.mjs) preserve public search queries, captured timestamps, all returned metadata rows and ordered partitions. Local `node lab/lines/example-slice/freeze-candidates.mjs --verify` reproduces selection without network or task content. The collector refuses to overwrite a saved pool.

Search counts: ky 32, zod 287, click 159, itsdangerous **0**. Twenty human candidates were frozen for each of the first three projects (five development, fifteen confirmation); no candidate exists for the fourth in this window. This means A-replay-1 cannot meet the four-project 12/12 promising screen. Keep the frame and report that shortfall; do not change dates or substitute a project after seeing the count. The three available projects can still give diagnostic replay evidence. A later broader cohort requires a separately reviewed protocol before task content is opened, not a repaired denominator for this cohort.

Prior-exposure audit searched local lab records for public URLs only; click PRs 3739, 3304, 3768, 351, 2380, 3407 and 3858 are marked if present, without refill. No known prior overlap was found among the frozen IDs. This records known exposure, not proof of model unfamiliarity. The initial broad local record search also displayed unrelated earlier request excerpts; no confirmation content was intentionally fetched. Any later discovered overlap must still be marked and excluded, without refill.
