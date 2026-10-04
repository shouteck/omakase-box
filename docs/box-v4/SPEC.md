# Open Box specification

## Product and scope

A Box is a deterministic versioned work object over Git. It connects a goal and approved expected behavior to repository/base revision, context, editable surface, environment, evaluator, executor/attempt policy, review and merge provenance. A person opens a Box to work; an agent consumes the same Box API. Frontend, backend, security/configuration, data, infrastructure and tooling are overlapping dimensions, not exclusive Box types.

The first delivery covers trusted synthetic/non-sensitive repositories and approved internal users/executors. Full repository context is permitted when selection is uncertain. Keep the existing TypeScript/React/Fastify/PostgreSQL stack and pinned tooling while reusing current components. Do not build a new VCS, editor engine, public marketplace or semantic-confidentiality compiler for this delivery.

## Immutable records

`BoxVersion` includes boxId, version, repoId, baseCommit, intentRecord/version, behaviorArtifact/hash, contextManifest/hash, editableSurface, environmentRef/digest, evaluatorRef/version/digest, disciplines[], workUnits[], interfaces[], endToEndObligations[], attemptPolicy, executorPolicy, mergeTarget and artifactHashes. Public/full-stack unit compatibility from existing contracts is reusable; disclosure/payment/KVM requirements are not mandatory Open Box fields.

`Attempt` binds executor identity, exact BoxVersion hash, base commit, worktree identity, actual patch/hash, environment/evaluator digests, receipts and review. A draft cannot run before required decisions, behavior approval and execution profile are resolved. A changed input creates a new version and invalidates affected approval/readiness/evaluation. Never edit a frozen version in place.

`ReviewDecision` binds an independent verdict to exact evaluated candidate bytes. `MergeRecord` binds review/approval, source candidate, actual merged Git commit, target/base, verification and Box/attempt provenance. Platform record approval, CEO wave approval and product-user behavior/merge approval are separate authorities.

## Flow for a requester

1. Select a registered repository and describe the desired outcome, current behavior, constraints and exclusions. Attach optional evidence. No handwritten technical spec is required.
2. Have a persisted conversation with the intent service. Ground draft facts in the pinned Git revision, tests/docs and supplied evidence. Show explicit assumptions and unknowns. Internal clarification is allowed before approval.
3. Review examples, before/after flows, state transitions or API interactions. A data-only preview is evidence of desired behavior, not proof the code works. The requester/owner approves the exact behavior artifact.
4. Prepare the Box with conservative context, explicit paths, a pinned environment and independent evaluator recipe. Unsupported capabilities or unresolved decisions block readiness with a reason. The planner can suggest decomposition; the customer decides whether a coherent feature should remain one Box.
5. Assign human, agent or hybrid execution. No AI-first default or claimed automatic solver capability. Open a reproducible attempt through the same Box protocol.
6. Review actual diff and independently evaluated evidence. Classify missing context/criteria as Box defects and infrastructure failure separately from implementation failure.
7. Approve a normal Git integration after drift checks. A trusted integration worker applies the approved operation; provenance is stored in Box history and optional Git trailers.

## Workbench and agent equality

Box Web provides create, approve, browse, assign, dependency/history, attempt/evidence and review views. The first workbench reuses Cursor or another available editor with an existing pinned workspace. It exposes approved behavior, context, evaluator commands and attempt diff beside coding. No bespoke editor fork is required.

The headless executor opens the same Box version, receives the same approved context and execution policy, runs the same evaluator API and submits the same attempt object. Agent/hybrid modes carry identity and scope, not special acceptance privileges. A simulator/demo adapter is labeled and never counts as a real agent integration receipt.

## Trust profiles

`open_trusted` uses a deliberately approved synthetic/non-sensitive repository, trusted pinned build/evaluator recipe and explicit executor policy. It may use existing local Dev Containers/Docker with bounded resources and no unnecessary credentials, daemon mounts or egress. It does not safely admit arbitrary strangers or secret-bearing code. Host execution is limited to reviewed Git/bookkeeping tooling; repository, candidate and generated code run in the declared workspace, not directly on the workstation.

`restricted_private` and `hostile_external` remain later-stage profiles governed by legacy release/private acceptance and dedicated disposable VM requirements. Never route those jobs through open_trusted or claim that Docker, sparse checkout or a private model solves semantic confidentiality. Profile transitions require a new reviewed design and CEO authorization.

## Acceptance and boundaries

Per-unit checks, interface checks and whole-Box end-to-end obligations all matter. Local unit success cannot accept a composed feature. Visible feedback and independent checks reference approved behavior; hidden acceptance cannot invent obligations. Missing evidence is unverified.

Allow multiple attempts, each in a distinct worktree. Box dependency graphs are separate from interfaces inside one Box. Check cycles, ready conditions, blocked/cancelled parents, permissions and target conflicts. A parent is not integration-ready merely because a worker returned.

Merges require an exact reviewed candidate, current target/base, passing required evaluation, owner authority and an approved integration destination. If the target moves, recompute the merge result and rerun affected checks; do not apply a stale review to a changed result. No automatic merge to shared/remote/production branches is authorized by START.md.

## Required demonstrations

Use a committed synthetic repository with a coherent UI/API feature and a separate application security-policy change. Also show one connected multi-discipline Box, stale target rejection, a passing local-unit/failing-interface attempt, an unpublished assumption classified as a Box defect, and an unavailable evaluator that cannot pass. A human-path walkthrough and actual headless-agent integration can verify software pathways; neither proves a genuine independent human pilot.

Keep separate statuses for delivered software, trusted execution, native pstack integration, independent review, live intent-model quality, human/agent study and restricted hostile execution. Fixtures and demo model output cannot establish customer preference, general task breadth or economic value.
