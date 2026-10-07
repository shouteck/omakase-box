# Line A session 1: what a failing example can guarantee

7 October 2026. Targeted literature survey and synthetic logical attacks; no real-change benchmark or solver comparison. Source IDs below resolve to direct links and reading scopes in [related-work.md](related-work.md).

## Finding

The programme's idea contains an established method and an unsupported leap. Working backwards from an observation is backward program slicing. A correctly modelled slice can preserve a defined observation of the current program. This does not prove that the same slice is a sufficient workspace for every future repair. An observed failure is evidence for the anchor, not a complete specification of the request.

Keep four propositions distinct:

1. **Observation preservation:** the selected artifact has the same specified base observation under stated inputs/environment.
2. **Repair intersection:** every permitted repair changes at least one location in a region.
3. **Repair containment:** all edits of a particular acceptable repair can be made within permitted paths.
4. **Work sufficiency:** the supplied artifact includes runtime/build inputs and the knowledge needed to produce an acceptable repair without asking for more.

Even proposition 2 would not imply 3 or 4. Our attacks directly target unrestricted 2 and helper sufficiency, not the soundness of a formal slicer under its own assumptions. A restricted repair language may make a weaker theorem possible; its restrictions must be written first.

## What the field supplies

**Static and dynamic slicing.** Static backward slicing follows potential data/control influence on a criterion; dynamic slicing narrows to a particular computation/input. These are not the same as recording every executed file, nor does a statement set necessarily form an executable program. The foundational treatments distinguish these definitions. [Tip survey](https://www.franktip.org/pubs/jpl1995.pdf), [Korel and Laski abstract](https://www.sciencedirect.com/science/article/pii/0020019088900543) (S1, S3; access limits recorded).

**Interprocedural dependence.** Caller/callee closure loses distinctions that system dependence graphs retain, including calling context and effects through parameters. The 1990 theory is stated for an explicit language model, with aliasing discussed separately. It is not a theorem about arbitrary configuration, external services or modern module loaders. [Horwitz, Reps and Binkley](https://www.cs.odu.edu/~cmo/classes/old/cs791sp05/readings/HorwitzRepsBinkley90.pdf) (S2).

**Unexecuted code matters even in debugging.** CONBAS's relevant slicing uses variables defined in unexecuted branches to add potential-dependence edges from executed condition/test nodes to later executed uses. Its algorithm traverses an execution-trace graph; it does not simply include every skipped statement. A fault can cause nonexecution. Relevant slicing and the predicate-switching/implicit-dependence alternative named in its related work are competing localisation methods, not arbitrary new-code prediction. The latter's underlying primary paper remains to be read before adopting it. [CONBAS](https://onlinelibrary.wiley.com/doi/10.1155/2012/628571) (S4).

**Fault localisation is a search aid.** Failing/passing spectra can rank suspicious locations; a suspiciousness ordering has no automatic claim to include all required repair/context files. The source-level dependence diagnosis in S4 likewise addresses a restricted model and observations. A single failure is particularly weak evidence of overall correctness. [Heiden et al.](https://doi.org/10.1002/SPE.2703) (S21).

**Reduction/debloating answers a different question.** Delta debugging minimises failure-inducing circumstances or differences already available. C-Reduce uses language-aware transformations to reduce compiler inputs. Chisel checks reductions against desired functionality and explicitly values maintainable structure. These are useful baselines for shrinking a reproducible artifact; none of these results establishes future repair sufficiency. [Zeller author page](https://www.st.cs.uni-saarland.de/papers/tse2002/), [C-Reduce paper](https://users.cs.utah.edu/~regehr/papers/pldi12-preprint.pdf), [Chisel paper](https://www.cis.upenn.edu/~mhnaik/papers/chisel.pdf) (S5–S7).

## Language and tool limits

**Typed is not a binary safety switch.** WALA's Java slicing depends on call/pointer analysis and configured dependences. Its official documentation warns that the computed closure slice need not execute, and that omitting heap/control edges is a scalability tradeoff. TypeScript explicitly permits unsound typing; type annotations cannot stand in for a dependency proof. [WALA](https://github.com/wala/WALA/wiki/Slicer), [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/type-compatibility) (S8, S12).

**Dynamic does not make soundness impossible.** TAJS describes sound abstract interpretation for a modelled JavaScript language. NoCFG reports a sound approximation proof for Python/C# (abstract only, assumptions still to read). The 2026 defensive capability work combines a model with restrictions enforced at runtime. These are reasons to state a supported subset and refuse unsupported cases rather than proclaim universal impossibility. [TAJS abstract](https://cs.au.dk/~amoeller/papers/tajs/), [NoCFG abstract](https://arxiv.org/abs/2105.03099), [capability analysis abstract](https://cs.au.dk/~amoeller/papers/capa/) (S11, S14, S16).

**Practical recall is imperfect and is the wrong unit for a Box promise.** Jelly's approximate-interpretation paper reports mean recall rising from 75.9% to 88.1% on 36 projects against dynamic graphs generated by tests; that reference itself observes only exercised calls. PyCG reports 69.9% mean recall against manually derived graphs for five macro projects, and lists unsupported dynamic/built-in features. These different evaluations cannot be compared as a language ranking or converted into a probability that a repair fits. The newer adaptive heap work studies scalability, not that probability. [Jelly paper](https://www.cs.au.dk/~amoeller/papers/approx/paper.pdf), [PyCG paper](https://arxiv.org/html/2103.00587), [2026 adaptive heap abstract](https://cs.au.dk/~amoeller/papers/aha/) (S9, S10, S15).

**Files other than source are part of the model.** Build tools, dependency versions, configuration, generated inputs and fixtures may be required even when they contain no executable statements. Filesystem existence and directory discovery can affect output. Hermeticity makes this boundary explicit. Import closure alone is not build closure. [Bazel](https://bazel.build/versions/8.0.0/basics/hermeticity) (S13).

## Features and new paths

An extension can fail before the intended branch exists. Reachability from the current entry point cannot discover an unreferenced helper the future patch will reuse. A wholly new feature has no universal nearest-sibling rule; choosing a sibling is an architectural heuristic that must be frozen before inspecting the fix.

A repair can consist solely of creating an absent module or discovered data file. No set of existing statements contains that file. A Box may permit new files in declared directories, so this is not automatically a product failure; it is a reason to score creation authority separately from historical-file membership. Directory state and absence are inputs if the theorem models them, which strengthens the model rather than rescuing an existing-code-only claim.

The two executable illustrations in [attacks.md](attacks.md) separate these issues. They are constructed witnesses, not sampled evidence, and provide no frequency estimate. A missing convenient helper may lead to duplicated code rather than failure; the replay must classify that instead of calling every omitted historical file fatal.

## Same failure, before and after boxing

Identical exit status does not establish the same failure. A loader refusal and a failed behavioural assertion may share an exit code. An output digest also measures text, not causality: timing normalisation may help portability but can mask substantive differences. The kitchen's accepted integer-ms masking limitation still applies.

For replay, record status, raw output, exception/assertion identity where available, and whether the behavioural check actually ran. Separate setup failure from defect-red failure. A fresh reader labels ambiguous matches before any solver comparison. Repetition is needed for unstable tests; one paired run cannot establish determinism. This is a proposed observation protocol, not a completed calibration study or a recommendation to change the product in this session.

## Recent neighbours and novelty

LLM slicing is already a research topic: Java slicing experiments (2024), constrained slice generation (SLICET5, 2025), and graph-plus-agent heterogeneous repository slicing (PolySlice, 2026). Only abstracts were read. Their slice prediction scores do not establish portable repair sufficiency, but rule out presenting graph-plus-agent slicing itself as new. [Java study](https://arxiv.org/abs/2409.12369), [SLICET5](https://arxiv.org/abs/2509.17338), [PolySlice](https://conf.researchr.org/details/icsme-2026/icsme-2026-nier/6/PolySlice-Towards-LLM-Agents-for-Program-Slicing-of-Heterogeneous-Code-Repository) (S17–S19).

The useful surprise is practical: Trail of Bits already documents graph-informed bounded source packets passed to helpers for analysis/patch proposals. Its skill explicitly excludes work dominated by dynamic behaviour, tasks needing repository exploration, and direct worker edits; its graph README documents best-effort dispatch and declared cross-language links. The skill permits one coordinator-generated context expansion and warns that its Claude fallback injects instructions/status/environment beyond the packet. We did not run it. It is a close adjacent baseline and weakens Line B's earlier suggestion that context choosing alone distinguishes the Box. No failing-example-driven runnable repair guarantee was established from those documents. [Trailmark README](https://github.com/trailofbits/trailmark), [packet/delegation skill](https://github.com/trailofbits/skills/blob/main/plugins/trailmark/skills/slicing-code-context/SKILL.md) (S20).

## What the next session must decide before looking at fixes

Formulate and preregister a replay, rather than implement a sophisticated selector:

- Freeze task sampling across multiple projects, with TypeScript and Python at minimum; record the actual check's base failure and fixed pass. Screen without using patch content to choose easy tasks. Report exclusions and project/task classes. Existing R3b/sample-1 cases are development cases, not held-out confirmation.
- Freeze execution-file selection, transitive resolved-import closure, entrypoint reachability under an identified analyser, and the generous source baseline. Record unresolved edges explicitly; no silent addition from the fix.
- Keep core region and packaging/build closure separate. Publish file and byte denominators for production source and total disclosed repository content; exclude dependencies/generated files only by a recorded common rule.
- Score existing production-edit containment, new-path permission, and observed failure preservation separately. Test/doc edits are separate categories. Read/reuse context needs are labelled by a reader; historical patch membership is only a proxy for necessity.
- An omitted file is classified as essential, usable alternative exists, or unknown, with a stated rationale. A sampled solver trial is needed to test the stronger no-second-message claim. Line D supplies that trial; it must not inherit an oracle patch as its rule.

The outcome that could change the product decision is a useful small region with high empirical coverage for a defined class, under actual isolation. A region close to the full source may preserve coverage but fail the stated value proposition. No numerical threshold is chosen after seeing replay outcomes. First freeze an operational size threshold and acceptable uncertainty in formulation; it is not determined by this survey.

## Standing and review

The unconditional assertion over unrestricted repairs to an existing-code-only region does not stand; a narrower empirical proposition remains worth testing. A state/directory-inclusive model or restricted repair language may support a scoped guarantee; neither is disproved by these witnesses. Real-change coverage, size, preparation effort and solver success are unknown. A fresh sceptic reproduced both witnesses and re-opened five key source groups; [review](sceptic-survey.md). Its CONBAS edge/statement wording correction is applied above, and its stronger state-model interpretation is retained. No product method has been adopted or transferred.

Pstack principles read and applied: **Model the Domain** separated observation, edit and work-sufficiency claims; **Prove It Works** required executable witnesses and fresh review rather than an assertion; **Foundational Thinking** put definitions before a selector. **Exhaust the Design Space** retained multiple published/rule baselines instead of picking an algorithm from intuition.
