# Box architecture and reuse boundaries

## Delegation focus, 5 October 2026

For future approved work, use [DELEGATION-MAP.md](DELEGATION-MAP.md). Add a focused preparation/package boundary through proposed `packages/box-packaging/**` and `services/private-api/boxes/packages/**`, reusing existing Box, Git, workspace and evaluator seams rather than rebuilding the platform. A request or pasted issue produces an approved agreement and an actual selected-source export. The recipient works from that package; owner-side full-repository verification remains separate.

Keep read context, editable scope and integration checks distinct. A package contains exact baseline/path mapping, selected source, declared dependencies, fixtures, commands and submission identity. Owner-reviewed manifests can prove the first supported handoff; no universal AI slicing is required. Package-local success does not accept the original application change. An unsupported extraction is a preparation gap, not permission to ship the full owner repository under a portability label. The active W002 candidate and approved architecture inputs are preserved; this paragraph governs future proposal design, not current source edits.

## Extend the current application

Keep the existing private control application and service as the trusted customer control plane. Add Box features in `apps/private-console/boxes/**`, `services/private-api/boxes/**` and `packages/box-contracts/**`; append real migrations under the current private DB migration system. Reuse auth, exact revision approval, private intake/providers and UI patterns through reviewed interfaces. Do not duplicate the whole platform or rewrite existing external/release code.

Use `packages/box-git/**` for reviewed Git operations, `packages/box-workspace/**` and `infra/box-workspaces/**` for the trusted profile, `packages/box-evaluation/**` for task-specific command/evidence records, and `packages/box-executors/**` for human/agent adapters. These are proposed scopes, not existing implemented modules. Approved task leases can adjust placement after B0's census.

Keep legacy private/external contracts and service credentials separate. New BoxVersion is its own aggregate; do not create a serializer that exposes internal/private objects to the external API. The old payment/disclosure/KVM profile is an extension for future restricted routing, not a dependency of every Open Box.

B0.2 inventories shared integration paths before coding approval, including package.json, scripts/suite.mjs, scripts/workspace.mjs, services/private-api/src/bootstrap/server.ts and main.ts, private DB schema/auth policy and app bootstrap wiring where actually needed. Each later immutable wave brief must name the exact additional paths, worker owner and revalidation. A tooling/shared lease coordinates approved writes; it cannot silently expand scope.

## Common API

Plan typed operations for repository registration, draft/approve/version Box, get context/behavior, create/open attempt, evaluate, submit actual diff, inspect evidence, assign executor, review and request merge. HTTP routes live under `/v1/boxes`, `/v1/box-repositories`, `/v1/box-attempts` and `/v1/box-evaluations`. Human UI and headless adapters call the same service methods and enforce the same authorization.

Separate authors, assignees, independent reviewers and merge owners. Human sessions reuse current protected auth; agent tokens are short-lived and scoped to one Box/attempt/capability. An executor cannot approve desired behavior or its own review/merge. Unknown fields, stale versions, wrong-repo bindings and foreign attempt IDs fail server-side. Establish server-side roles in B1 rather than trusting browser labels.

Persist BoxVersion, behavior/intent references, Attempt, EvaluationReceipt, Assignment, BoxDependency, ReviewDecision and MergeRecord separately. Commands are idempotent with client keys, optimistic versions and transaction-owned transitions. Snapshot provenance is distinct from worktree/merge execution. Private model context remains confined to the intent service and is never a contributor-facing chat endpoint.

## Git adapter

Require a real committed baseline. Register only reviewed absolute repository roots and known allowed merge targets. Use fixed Git argument arrays through the current process abstraction; never shell-expand user/model branch names or paths. Worktree roots remain inside a checked workspace directory. One attempt/branch owns each writable checkout. No public remotes, force pushes, rebases or deletion of unknown worktrees.

Open attempts at immutable base commits; collect actual diffs and validate exact path edits. Bind patch bytes, candidate commit/content manifest, Box/environment/evaluator versions and result receipts. Handle dirty roots without stashing or overwriting user changes. Capture real Git commit IDs; a digest-only CandidateDiff is useful binding data but not a commit or actual merge.

The merge queue has one integration lease per target. Compute conflicts/drift; require current independent verdict and user authority; integrate only the reviewed result. A changed target/result triggers affected revalidation. Record actual target/result commits and provenance, optionally using reviewed Box-ID/Attempt-ID trailers. Synthetic integration is not a production merge.

## Workspace and evaluator

The trusted workspace consumes approved environment and command graph IDs mapped to fixed argument arrays. Never run arbitrary model strings or candidate setup scripts on the host. Pin tools/image digests and serialize heavy checks on the present Windows host. A reviewed local Dev Container/Docker recipe is the first reusable execution substrate; a managed remote editor is an optional later adapter, not a required purchase.

Separate visible checks from independently authored acceptance. The evaluator executes against exact attempt/environment/evaluator hashes and stores bounded outputs, duration, status and declared assurance. It verifies observed behavior, not candidate stdout claiming pass. Tests may need more context than the visible subset, but cannot add unpublished requirements. Cancellation, timeouts and unavailable execution are distinct non-pass outcomes.

Current private runner protocol and evidence vocabulary can be reused after fit review. Open Box execution has new IDs and an explicit open_trusted profile; do not loosen legacy enums/guards to dispatch restricted jobs through it. Candidate code still runs only inside the approved workspace. Reproducibility is not security or product correctness.

## Workbench and service integration

Initially write a small project instruction/launch adapter for installed Cursor/editor capabilities and a Box behavior/context/evidence panel or native document view. Reuse the editor's code/terminal/diff features. A Box API availability failure must be visible. The headless adapter uses the same context and evaluation functions with scoped identity, cancellation and bounded progress. Avoid a hard dependency on proprietary editor hooks until an actual supported integration is verified.

If native editor APIs cannot support a persistent behavior pane, present an explicit fallback using the existing web detail plus editor/workspace link and record the UX limitation. Do not report a screenshot of an unrelated IDE as Box integration. Fresh participants and task classes, not this architecture diagram, decide whether a dedicated IDE is justified.

## Revision note — 2026-10-04 (W001/B0.2)

Appended under wave W001 (CEO "Approve", 2026-10-04T07:11:18Z, brief `.execution/box-v4/briefings/W001.md` r4, sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1), adapter `devin_portable_pstack_adaptation`, base commit `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c`. Sections above remain the committed baseline; this section records the seam contract produced under B0.2 scope (wave-task scope only — acceptance of B0.2 itself is a separate root decision, not claimed here). Companion: `docs/box-v4/profile-contract.md`. Source findings cited from `.execution/box-v4/evidence/B0.2/product-input.md` (sha256:517e2b4f0838452566830614fb5fa5777f182331c36c041827f6935443b8f140) and the B0.1 census (`docs/box-v4/reconciliation/census.md`).

## Open Box seams (produced under B0.2)

### Persisted aggregates

Persist separately, each with immutable version/hash binding per SPEC: `BoxVersion`, `Attempt`, `EvaluationReceipt`, `Assignment`, `BoxDependency`, `ReviewDecision`, `MergeRecord`, plus the behavior artifact and a persisted conversation model (SPEC flow step 2; the conversation aggregate is ABSENT today — product-input.md exists/absent map; its final shape is open decision Q1 in profile-contract.md section 6). Exact-hash approval, optimistic-version transitions and superseded-approval invalidation reuse the intent machinery (`services/private-api/db/intent-store.ts`: `approved_hash = content_hash`, `superseded()`, `approvalInvalidated`) — observed mechanics, not yet exercised for Box objects.

### API seam

Route families: `/v1/boxes`, `/v1/box-repositories`, `/v1/box-attempts`, `/v1/box-evaluations`. The same service methods serve UI and headless callers with identical authorization; the headless executor submits the same attempt object. Proposed scopes (not implemented): `apps/private-console/boxes/**`, `services/private-api/boxes/**`, `packages/box-contracts/**`, `packages/box-git/**`, `packages/box-workspace/**`, `packages/box-evaluation/**`, `packages/box-executors/**`. Server-side roles come from `packages/contracts/auth/policy.ts` extended with box actions, not browser labels. Strict separation from legacy restricted enums/guards: `EvaluationAttemptSchema`'s `dedicated-linux-kvm-fresh-vm` runner profile is NOT the Open Box `Attempt` and must not be loosened to carry one.

### Git adapter seam

Registered absolute repository roots only; fixed argument arrays through the current process abstraction (`scripts/process.mjs` spawn pattern); no shell-expanded names/paths. One attempt/branch owns each writable worktree; worktree roots stay inside a checked workspace directory. Attempts open at immutable base commits and bind real commit IDs — a digest-only CandidateDiff (`packages/evaluation/pipeline/candidate-diff.ts`) is binding data, not a commit or merge. One integration lease per merge target; a moved target recomputes the merge and reopens affected checks.

### Workspace and evaluator seam

Environment and evaluator are pinned digests referenced by BoxVersion/Attempt; the evaluator executes against exact attempt/environment/evaluator hashes and stores bounded receipts. Visible (solver-facing) checks and independently authored acceptance are separate sets; unavailable, cancelled and timed-out execution are distinct non-pass outcomes — never folded into pass or left ambiguous. `scripts/suite.mjs` already returns `{status: 'unavailable'}` for unimplemented or `--real`-gated suites — the observed honest-unavailable convention the Box evaluator must keep.

### Where the seams touch absent surfaces

Product-input.md's exists/absent map (verified against current source): persisted conversation — ABSENT; Box list/detail/browse — ABSENT (console nav has only intake/intents/releases/assignments/readiness/review); workbench/diff view — ABSENT; executor/attempt-open flow — ABSENT; Box dependency graph and merge UI — ABSENT. Reusable existent mechanics: session/CSRF plumbing, intake/evidence bounds, decision/exact-hash/superseded machinery, provider provenance labels, blocked-with-reason UX, explicit executor-choice posture. Each seam above therefore names both what exists to reuse and what is net-new; the shared-write inventory lives in `.execution/box-v4/evidence/B0.2/integration-paths.md` and the profile boundary in `docs/box-v4/profile-contract.md`.
