# Fresh sceptic: A-replay-1 formulation

7 October 2026. Host: local Codex desktop on Windows, PowerShell, Asia/Singapore. Model: exact model identifier unavailable to this reviewer; no model diversity claimed. Fresh reviewing agent, not the formulation author. This is a formulation review, not an executed benchmark review.

## Checks performed

Read AGENTS.md, STATUS.md, the kitchen procedure, lab/README.md, lab/roles/sceptic.md, the line README, survey conclusion and replay-protocol.md. Read Model the Domain and Sequence Verifiable Units principle files: they changed this review by requiring separate endpoint states and checking each freeze gate independently. No paid resources, project code executions, task titles/bodies, task diffs or production fixes were used. No container, dependency installation or heavy job was needed.

Read the metadata collector. Ran `node lab/lines/example-slice/freeze-candidates.mjs --verify`; its local replay passed. Independently reconstructed ordering and human filtering with PowerShell rather than relying only on the collector's own function. Checked incomplete-result flags, cutoff/100th-row ties, field names and overlap with the collector's declared known-exposed click IDs. All ordering checks matched; all incomplete flags and cutoff ties were false; no known-exposed candidate overlap was present. This does not establish absence of undocumented prior exposure.

Reviewed candidate snapshot SHA256 `E75F131BA7D7637F664FE403DB33997F8AA453939AAB7CC46D1999F21E106C54`.

| Project | Search matches | Fetched rows | Human rows | Frozen candidates |
|---|---:|---:|---:|---:|
| ky | 32 | 32 | 32 | 20 |
| zod | 287 | 100 | 97 | 20 |
| click | 159 | 100 | 100 | 20 |
| itsdangerous | 0 | 0 | 0 | 0 |

Independently reopened the two newly cited primary papers. The predicate-switching paper's introduction and nested-predicate caveats support the formulation's scoped description; its single-predicate intervention is not a future-repair guarantee. [Zhang et al., PLDI 2007](https://www.cs.ucr.edu/~gupta/research/Publications/Comp/pldi038-zhang.pdf). GenProg sections III.D–F distinguish mutation destinations from insertion/replacement donor statements, supporting separation of edit and reuse scope. No repair rate or modern-language applicability follows from that distinction. [Le Goues et al., ICSE 2012](https://squareslab.github.io/papers-repo/pdfs/weimer-icse2012-genprog-preprint.pdf).

## Findings on the reviewed draft

1. **The positive four-project screen is already infeasible in this frozen frame.** There are no itsdangerous candidates, so three admitted cases there and therefore 12/12 cannot occur, regardless of selector quality. Preserve the empty cell and classify A-replay-1 as incomplete/no demonstrated promise under its declared screen. Do not replace the project or widen dates in version 1. This is sampling feasibility evidence, not an observed selector failure or evidence of uselessness. A later positive screening study needs a new preregistration and cohort.

2. **The screen lacks an explicit same-failure conjunct.** `reference-feasible` requires applying/passing the historical patch, while the screen asks for stable paired observations. A package can stably fail for a different reason before the patch and pass afterwards. It would satisfy those words while missing the question's reproduction endpoint. Require `same-observed-failure` in all three base-package observations against the admitted full-base reference, in addition to reference feasibility and small size. Stable `different`, loader/setup failure for a behavioural bug, or `unknown` cannot pass this screen. This is a logical counterexample to the draft criterion, not an executed case.

3. **Freeze an exact source denominator and the primary expansion condition.** The draft names a registered production root but also scores out-of-root production changes and counts all shipped build source. State whether the source denominator is all base tracked hand-authored production throughout the repository or only the registered root; keep the registered root as authority/selector scope. Freeze generated/source classifications before confirmation. Publish numerator/denominator path lists, handle a zero denominator as undefined, and count every shipped base production file in a coherent universe. Identify whether the raw or expanded runnable condition enters the primary screen; publishing both cannot quietly let an expansion rescue the raw rule.

4. **Make unknown context a disqualifier in the screen.** `essential-for-reference`, `replaceable`, and `unknown` are labels; the phrase “no unresolved essential context” can be read as allowing an unknown file because it was never proved essential. The later incomplete sentence suggests the intended stricter interpretation. Explicitly require no unresolved/unknown contextual judgement in a passing row. Even known replaceability is only a reference replay judgement; it must not become proof of solver sufficiency.

5. **Clarify R's seed traversal before implementation.** A behavioural entry can import a local test helper that syntactically imports production only in an unexecuted branch. The intended static R condition should traverse local test/helper imports irrespective of execution, then seed each syntactically resolved production import; its wording currently permits a direct-entry-only interpretation. Distinguish this from EI with a development fixture before opening confirmation. Nonliteral edges stay unknown under either rule.

## What survives the attacks

The formulation correctly separates observation preservation, historical containment, new-path authority and solver sufficiency. Maintainer tests are deliberately supplied as an overlay, so this is a historical-change replay with privileged tests, not ordinary open-task evaluation. First-eligible admission conditions on runnable tests and setup; exclusions and candidates must remain visible. Three cases per project do not guarantee three per task class. The arbitrary 25% threshold, unpooled descriptive reporting, hypothetical Wilson calculation and prohibition on inference to customers are appropriate limits.

The two blind gates are meaningful: implementation/adapters before confirmation content, then all task manifests before any confirmation scoring or production-patch reveal. No evidence in this review establishes runtime isolation, adapter correctness, test readiness, same-failure agreement, missing-file necessity or real coverage. Those remain instrument/replay obligations.

## Standing

**The narrow empirical question stands; the reviewed draft's positive screening claim does not stand as written.** Candidate selection mechanics pass this metadata-only review. Findings 2–5 need explicit disposition before treating version 1 as frozen. Even after correction, finding 1 makes a positive four-project decision impossible for this cohort. Freezing the honest shortfall and proceeding to instrument work is defensible; announcing a successful benchmark or product guarantee is not.

The author may record revisions and disposition separately. This file preserves the original review and must not be treated as a benchmark PASS.

## Revision check, 7 October 2026

Independently read the corrected protocol after the author reported revisions. The original findings above remain unchanged as a record of the reviewed draft. Required formulation blockers 2–5 are resolved in the revised text:

- The PRIMARY screen now expressly requires `same-observed-failure` in all three paired base runs. A failure-identity schema and normalization version must be frozen before scoring; stable different failures cannot pass.
- Operational source denominators now use a fixed extension set across all base tracked non-test source, including generated source and build scripts, plus a separate registered-root denominator. Both file and byte fractions against both universes must satisfy 25%. Zero denominators are unknown. This is an explicit operational measure, not a hand-authored-source claim. The primary condition excludes extra production expansion; expanded packages are diagnostic only.
- The screen disallows omitted essential-for-reference files and every unknown reading/reuse label. Replaceable omissions need evidence and sceptic agreement, without becoming a solver or all-repair guarantee.
- R now traverses every statically resolved test/helper import, including unexecuted branches and helpers, before selecting reachable production targets. Adapter fixtures and source-map verification remain future instrument obligations.

Finding 1 is correctly retained as an observed sampling shortfall: the protocol says itsdangerous has no candidate, the four-project positive screen cannot pass, and neither the window nor project may be substituted in this cohort. The resulting three-project diagnostic work does not inherit a positive four-project conclusion.

**Revised standing: the corrected formulation and metadata-only candidate-pool freeze stand, subject to the promised Git freeze.** No remaining formulation blocker was identified in these corrected passages. This approves a falsifiable, explicitly incomplete cohort and its future measurement rules, not an implemented instrument, runtime feasibility, real-change benchmark result, or product guarantee. The implementation/adapters and final task manifests still need their later blind gates. No third-party project or task content was inspected in this revision check.
