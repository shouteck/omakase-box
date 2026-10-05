# Open Box specification

## Product and scope

The CEO's 5 October 2026 refocus makes portable work preparation and delegation the next product proof. Read [DELEGATION-MAP.md](DELEGATION-MAP.md) and its D-series graph for future waves. The existing approved W002/B1.1 contract and B history remain unchanged; this specification update does not expand current implementation authority.

The initial buyer hypothesis is a team that regularly delegates bounded changes to contractors it chooses. The common protocol supports owner-selected authorised contributors and agents without a mandatory vendor workforce. Apply [VALIDATION-PLAN.md](delegation/VALIDATION-PLAN.md): measure total preparation/onboarding/acceptance effort against ordinary delegation, and report real repeat use and commercial evidence separately from technical success. Organisation-access execution remains valid under its declared permissions; it proves neither selected-source portability nor confidentiality. No pilot or current-wave expansion is authorised by this specification.

A Box is a deterministic versioned work object over Git. It connects a goal and approved expected behavior to repository/base revision, context, editable surface, environment, evaluator, executor/attempt policy, review and merge provenance. A person opens a Box to work; an agent consumes the same Box API. Frontend, backend, security/configuration, data, infrastructure and tooling are overlapping dimensions, not exclusive Box types.

The first delivery covers trusted synthetic/non-sensitive repositories and approved internal users/executors. It demonstrates a selected-source package with sufficient dependencies, fixtures, approved behavior and patch mapping to work without the owner repository. Full repository context remains permitted for an existing Open Box mode when selection is uncertain, but cannot count as portable-package success. Keep the existing TypeScript/React/Fastify/PostgreSQL stack and pinned tooling while reusing current components. Do not build a new VCS, editor engine, public marketplace or semantic-confidentiality compiler for this delivery.

## Immutable records

`BoxVersion` includes boxId, version, repoId, baseCommit, intentRecord/version, behaviorArtifact/hash, contextManifest/hash, editableSurface, environmentRef/digest, evaluatorRef/version/digest, disciplines[], workUnits[], interfaces[], endToEndObligations[], attemptPolicy, executorPolicy, mergeTarget and artifactHashes. Public/full-stack unit compatibility from existing contracts is reusable; disclosure/payment/KVM requirements are not mandatory Open Box fields.

`Attempt` binds executor identity, exact BoxVersion hash, base commit, worktree identity, actual patch/hash, environment/evaluator digests, receipts and review. A draft cannot run before required decisions, behavior approval and execution profile are resolved. A changed input creates a new version and invalidates affected approval/readiness/evaluation. Never edit a frozen version in place.

`ReviewDecision` binds an independent verdict to exact evaluated candidate bytes. `MergeRecord` binds review/approval, source candidate, actual merged Git commit, target/base, verification and Box/attempt provenance. Platform record approval, CEO wave approval and product-user behavior/merge approval are separate authorities.

## Flow for a requester

1. Choose work for a registered repository: paste an issue/request body or describe a new change. Tracker selection and API triggers are optional adapters; a URL alone is not fetched evidence. No handwritten technical spec or mandatory conversation is required.
2. The preparation engine grounds draft facts in the pinned source, tests/docs and supplied evidence. Conversation is available for refinement. Multiple turns can refine one Box and a request can produce several related outcomes; preserve coherent full-stack work rather than forcing one Box per message.
3. Review the proposed result through a concise example, before/after flow or input/output scenario using current application terminology. Show consequential unresolved choices without exposing internal technical bureaucracy. The owner approves the exact behavior; previews and tests alone do not approve it. A later amendment creates a new agreement version.
4. Prepare the actual package: relevant source/context, distinct editable scope, declared dependencies/fixtures, environment, independent evaluator and submission mapping. A fresh package-only workspace must be usable; unsupported coupling or missing obligations block readiness with a reason. No silent full owner checkout fallback clears portability.
5. Assign a trusted human, agent or hybrid executor through the same Box protocol. External bounty publication is a separately authorised later route, not draft creation or automatic task readiness. No forced AI routing or claimed automatic solver capability.
6. Receive a real scoped patch. Verify it independently in the owner's original repository, including whole-Box interfaces and preservation. Local package checks alone cannot accept it. Classify missing context/criteria as preparation defects and infrastructure failure separately from implementation failure.
7. Approve normal Git integration after current review and drift checks. Record actual result and provenance; no automatic production publication, payment or later wave follows.

## Workbench and agent equality

Box Web provides create, approve, browse, assign, dependency/history, attempt/evidence and review views. The first workbench reuses Cursor or another available editor with an existing pinned workspace. It exposes approved behavior, context, evaluator commands and attempt diff beside coding. No bespoke editor fork is required.

The headless executor opens the same Box version, receives the same approved context and execution policy, runs the same evaluator API and submits the same attempt object. Agent/hybrid modes carry identity and scope, not special acceptance privileges. A simulator/demo adapter is labeled and never counts as a real agent integration receipt.

## Trust profiles

`open_trusted` uses a deliberately approved synthetic/non-sensitive repository, trusted pinned build/evaluator recipe and explicit executor policy. It may use existing local Dev Containers/Docker with bounded resources and no unnecessary credentials, daemon mounts or egress. It does not safely admit arbitrary strangers or secret-bearing code. The repository's own first-party code, written and reviewed by the kitchen, builds and tests directly on the development host. Code from an untrusted third party never does; it belongs to the later profiles below.

`restricted_private` and `hostile_external` remain later-stage profiles governed by legacy release/private acceptance and dedicated disposable VM requirements. Never route those jobs through open_trusted or claim that Docker, sparse checkout or a private model solves semantic confidentiality. Profile transitions require a new reviewed design and CEO authorization.

## Acceptance and boundaries

Per-unit checks, interface checks and whole-Box end-to-end obligations all matter. Local unit success cannot accept a composed feature. Visible feedback and independent checks reference approved behavior; hidden acceptance cannot invent obligations. Missing evidence is unverified.

Allow multiple attempts, each in a distinct worktree. Box dependency graphs are separate from interfaces inside one Box. Check cycles, ready conditions, blocked/cancelled parents, permissions and target conflicts. A parent is not integration-ready merely because a worker returned.

Merges require an exact reviewed candidate, current target/base, passing required evaluation, owner authority and an approved integration destination. If the target moves, recompute the merge result and rerun affected checks; do not apply a stale review to a changed result. No automatic merge to shared/remote/production branches is authorized by START.md.

## Required demonstrations

Use a committed synthetic repository with a coherent UI/API feature and a separate application security-policy change. Also show one connected multi-discipline Box, stale target rejection, a passing local-unit/failing-interface attempt, an unpublished assumption classified as a Box defect, and an unavailable evaluator that cannot pass. A human-path walkthrough and actual headless-agent integration can verify software pathways; neither proves a genuine independent human pilot.

Keep separate statuses for delivered software, trusted execution, native pstack integration, independent review, live intent-model quality, human/agent study and restricted hostile execution. Fixtures and demo model output cannot establish customer preference, general task breadth or economic value.
