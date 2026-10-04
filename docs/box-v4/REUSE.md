# Existing work and realignment audit

This read-only assessment was performed on 4 October 2026. It is a source/evidence inventory, not a new execution of product tests. The [preservation baseline](../../.execution/box-v4/preservation-baseline.json) hashes 426 product/runtime/test files before instruction edits. The [legacy snapshot](../legacy/m0-m9-20261004/manifest.json) preserves old instructions, graph and state.

| Existing asset | Reuse | Needed before Box delivery |
|---|---|---|
| packages/contracts public/private, composition and hash modules | Version/hash/requirements/interface invariants | Separate Open Box aggregate; remove mandatory reward/disclosure/KVM requirements from its profile |
| Private intake, intent-store, orchestrator and console intent UI | Evidence, decision resolution, exact approval and invalidation | Persisted conversation, approved behavior artifact and Box binding |
| Snapshots/importer and planner retrieval/providers | Bounded repo/evidence reading, demo and local-model adapter | Real Git snapshot identity and independent live-model quality evaluation |
| Compiler/workspace catalogue and trusted image profile | Pinned toolchain, approved examples and packaging vocabulary | General trusted repository/workspace lifecycle rather than only special module templates |
| Evaluation jobs/store, fit/pipeline and candidate-diff data | Exact bindings, failure categories and composition checks | Actual patch/commit, Open Box evaluator execution and independent expectations |
| Private assignment and external reservation/board components | Identity and assignment concepts, selected executor labels | Internal Box assignment/capability API without bounty/payment coupling |
| Public composition graph | Within-task unit/interface validation | Separate cross-Box dependency graph, attempt coordination and merge ordering |
| Approval/release/ledger/VM controls | Later restricted/private/external stages | Retain gates; do not force them onto every Open Box or weaken them |

## Gaps that change the next wave

Git inspection found unborn master with no commits and the project files untracked. Correction 2026-10-04 (B0.1, W001): that finding predates the baseline. Git now records HEAD `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c` on `master` (tracking `origin/master`) with two commits — `53ec783` "Establish existing MVP baseline and Box kitchen governance" and `2ad7e35` "Preserve byte-bound Box evidence across Git checkouts" — plus uncommitted S001/W001 governance artifacts (`.devin/`, `.execution/box-v4/{approvals,briefings/archive,setup}/`, `docs/box-v4/DEVIN-SETUP.md`, and modifications to `AGENTS.md`, `START.md`, `docs/box-v4/PSTACK.md`, `.execution/box-v4/{briefings/W001.md,state.json,waves/W001.json}`). No actual attempt/worktree/commit/merge helpers were found. CandidateDiff is a hash-bound data record, explicitly not a merge. A reviewable baseline plan and actual Git-backed mechanics are required before a Box can claim Git provenance.

The present UI includes intake, decisions, release, assignment/readiness and owner review components. It is not yet a Box list/detail/history/workbench flow. Human/AI/team selection is descriptive, not a headless executor. Build one common Box API and reuse existing editor/workspace infrastructure; do not reconstruct an IDE.

Current .execution/state.json records 18 tasks in review with checked implementations and 14 blocked. Historical handoffs/previousAccepted/reviewHistory contain distinct reviewer approvals, while current independentReviewVerified is false. Nineteen reconciliation records report shared decision-log drift with product bytes unchanged, not current metadata approval. Preserve both facts. Reconcile actual candidate digests and new integration evidence; do not announce that nothing was reviewed or that the current product is delivered.

Existing trusted Docker/WSL tooling is operational according to saved records. The dedicated Linux KVM/libvirt runner for hostile/private evaluation is missing. This is an unchanged later-profile blocker. The CEO-approved Open Box-first direction permits a separately designed trusted/non-sensitive profile; it does not clear that old runner gate.

## Migration discipline

Keep legacy graph/state and evidence unchanged. Root START/AGENTS/PLAN now select the new B-series backlog through .execution/ACTIVE_PLAN.json. Old execution/checkpoint scripts have hardcoded legacy paths and cannot drive new state. No new orchestration code is supplied in this revision.

B0 records component verdicts as reusable, needs adaptation, needs revalidation, or deferred, with actual paths and hashes. Existing components do not automatically satisfy a B-series unit. New acceptance requires its own output evidence, independent reviewer and authorized integration. Never bulk re-snapshot old tasks to bless governance edits.
