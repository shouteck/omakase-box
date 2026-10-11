# Architecture and interfaces

## Repository layout to implement

    apps/private-console/       React/Vite requester and owner UI
    apps/contributor-portal/    React/Vite released-task UI
    services/private-api/      Fastify private workflow, DB, model and release authority
    services/external-api/     Fastify contributor workflow and external DB
    services/runner-controller/ isolated-VM job transport and verification; no public listener
    packages/contracts/       separate public/private DTO schemas and workflow rules
    packages/planner/         private evidence retrieval and provider adapters
    packages/analyzer/        typed dependency and capability analysis
    packages/compiler/        deterministic approved-only package construction
    packages/runner-protocol/ bounded job/result schemas; trusted harness identifiers
    packages/evaluation/      evidence classification, private-fit checks and ledger rules
    templates/workspaces/     fixed public task templates
    examples/private-shop/    entirely synthetic company fixture, excluded from exports
    research/                 study inputs and reports, never fabricated participant results
    tests/security/           adversarial boundary checks
    tests/e2e/                PM/contributor/acceptance browser journeys

Use package export boundaries so external-api cannot import private contract modules or private storage adapters. A build-time dependency check enforces this in addition to runtime ACLs. No shared generic `Task` serializer.

## Data and hashes

`InternalIntent` records version, goal, facts, evidence, decisions, assumptions, unknowns, acceptance examples and scope. `PrivateIntegrationPlan` records private revision mapping, retained work and template-specific destination paths. Neither is externally serializable.

`ExternalTaskContract` has opaque task ID and positive integer version; generic title and purpose; nonexclusive discipline tags, versioned work units, public interfaces and end-to-end requirements as defined in COMPOSITION.md; requirements with stable IDs, inputs, outputs, states, invalid cases, exclusions and examples; relative editable paths; fixed dependencies, public image digest and template version; public check IDs; acceptance categories; reservation/revision/compensation terms; reward/currency; feedback policy ID; and requirement-to-check links with public identifiers only. Store private traceability in a different type/table.

`ApprovedReleaseManifest` enumerates every released relative path, SHA-256, byte size, media type and source asset ID. It also binds hashes of the canonical external contract, listing, feedback policy, payment terms, template and execution image. Asset contents come from a dedicated release-candidate store. After approval they are immutable content-addressed objects. Private provenance is separate.

Canonical hashes use UTF-8 JSON with sorted object keys and stable array order. Version the canonicalization algorithm. Normalize safe relative path separators to `/`; do not silently normalize colliding paths. Deterministic ZIP output uses lexicographic paths and fixed timestamps/permissions. Approval signs the canonical manifest hash with a private Ed25519 signing key; external-api verifies using only the public key. Keys are runtime secrets, not source-controlled or model-visible. Approval actor, timestamp and private revision are kept outside the exported envelope.

`SubmissionEnvelope` contains task lineage/version, package digest, reservation ID, UTF-8 patch bytes/hash and client idempotency key. The server derives actor identity. `EvaluationAttempt` binds submission, approved package, runner profile, harness digest and private base revision. `InternalEvaluationResult` contains evidence and private logs. `PublicFeedback` contains only public ID, approved category, public-check details when applicable and release-policy version.

## Workflow transitions

Intent: `draft -> needs_decision -> ready_for_approval -> approved`. Changes create a new revision. Preparation: `proposed -> checked -> release_review -> approved -> packaged -> ready -> published`; any required failed check blocks advancement. `withdrawn` preserves history. Reservation: `active -> in_review -> active` for permitted changes, or `active/in_review -> accepted | expired | cancelled`. Submission attempts have their own lifecycle; original reservation expiry never resets. Superseded attempts cannot be accepted. Submission: `received -> public_evaluating -> private_evaluating -> owner_review -> accepted | changes_required | package_defect | infrastructure_failure`. No transition from an exception or timeout to acceptance. Ledger: `due -> settlement_recorded` or compensating adjustment, never destructive mutation.

All mutating transitions check current version and state inside a DB transaction. Return 409 for stale revisions, 403 for role failures, 400/422 for bounded invalid inputs. Public errors use fixed safe messages; private error detail stays private. The external DB is the authoritative quota owner. Its transaction writes an attempt permit, all three quota reservations, the submission and an outbox event before enqueueing. A service-signed permit binds task lineage, reservation, package/submission hashes and sequence number; private import uses a unique permit ID and outbox recovery. Never enqueue from an unvalidated contributor assertion. Quota refund is not automatic after an unknown/interrupted job. Duplicate idempotency keys return the existing result without spending another slot.

## Main service interfaces

    PlannerProvider.proposeIntent(input: PrivatePlanningInput, signal): Promise<IntentProposal>
    PlannerProvider.proposePartition(input: PrivatePartitionInput, signal): Promise<PartitionProposal>
    analyzeBoundary(snapshot, candidate): BoundaryReport
    compileApprovedRelease(approvedSet: ApprovedReleaseSet): PackageArtifact
    publishReleasedEnvelope(envelope: SignedReleasedEnvelope): PublishedTask
    validateSubmission(envelope, frozenTask, actor): SubmissionValidation
    RunnerClient.run(job: ApprovedEvaluationJob, signal): Promise<RunnerResult>
    classifyEvaluation(publicResult, privateResult, frozenContract): InternalEvaluationResult
    recordAcceptance(owner, evaluationId, expectedVersion): AcceptanceRecord

The compiler receives approved bytes, not a private repository path or provider. Planner input/output cannot contain executable commands, approval fields or arbitrary URLs. Runner jobs accept only template/harness IDs mapped to fixed trusted commands; a client-supplied shell command is invalid.

## API route families

Private API: `/v1/snapshots`, `/v1/requests`, `/v1/intents`, `/v1/decisions`, `/v1/preparations`, `/v1/release-approvals`, `/v1/publications`, `/v1/assignments`, `/v1/evaluations`, `/v1/acceptances`, `/v1/payment-obligations`, `/v1/research-records`. Each resource has explicit role permissions, request schemas and safe response DTOs. Approvals require actor session, exact hash and expected version.

External API: `/v1/tasks`, `/v1/tasks/:id/reservations`, `/v1/reservations/:id/package`, `/v1/reservations/:id/submissions`, `/v1/submissions/:id/status`, `/v1/reservations/:id/package-defects`. Import/export bridge endpoints require separate service credentials and signed envelopes; contributors cannot call them. Signed bridge requests include nonce, expiry and digest to prevent replay. The private service pulls bounded submissions; the external process never queries the private DB.

Local hosts/ports: `private.localhost:3000` console and `private.localhost:4000` private API; `contributor.localhost:3001` portal and `contributor.localhost:4001` external API. Use host-only cookies, separate keys and exact origin allowlists. Verify browser cookie separation and local resolution; do not substitute a single localhost cookie host merely because ports differ. Trusted Compose services have separate volumes and network grants. PostgreSQL is not externally exposed by default. Browser auth does not grant network access to the private model or runner.

## Model adapter

Implement `DemoPlannerProvider` with fixture-driven typed responses visibly marked demo, and `OllamaPlannerProvider` using a customer-approved local `/api/chat` endpoint. Submit system instructions plus bounded private evidence, `stream:false`, configured model name, a fixed application-owned output schema and timeout. Validate the returned content again. Allow one bounded repair attempt; otherwise return a typed failure, never invent success. Ignore tool-call instructions. The model name is configuration; do not download weights or choose a paid cloud endpoint automatically.

The endpoint is configured by an operator, not generated by the AI or supplied by a contributor. Default remote endpoints are disabled. Endpoint allowlisting, TLS/network routing and log retention must be documented for a customer-controlled private deployment. A protocol mock verifies adapter behaviour without being labeled a live-model test.

## Commands to establish in M0 and extend

At repository root provide `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, `pnpm doctor --json`, `pnpm demo:seed`, `pnpm demo`, `pnpm test:contracts`, `pnpm test:auth`, `pnpm test:planner`, `pnpm test:analysis`, `pnpm test:compiler`, `pnpm test:runner`, `pnpm test:portal`, `pnpm test:acceptance`, `pnpm test:security`, `pnpm test:e2e`, `pnpm research:report` and `pnpm verify:mvp`. No empty scripts that return success. A not-yet-implemented mandatory suite is explicitly unavailable, not passing.

`verify:mvp` runs mandatory gates and emits machine-readable delivery status. It returns nonzero if a required gate fails or is unavailable. It reports demo, actual runner, live model, independent review and human evidence separately. `doctor` prints capabilities without secrets. Seed/reset acts only on identified synthetic demo workspaces, never arbitrary customer data. Logs and evidence are bounded and private unless explicitly release-approved.

## VM lifecycle and trusted result authority

Add `RunnerVmProvider.createFromBaseline(imageDigest, jobId)` and `destroy(leaseId)` to runner-controller. The initial real adapter uses an operator-owned dedicated Linux host with KVM/libvirt: clone a read-only known baseline into a unique disposable disk overlay, start a fresh guest with fixed resource/device configuration, verify its management SSH host identity through the broker and transport bounded job bytes. Fixed broker operations take typed identifiers, never arbitrary shell snippets. Destroy the guest and overlay after each job; a lease/result failure quarantines it. Do not reuse a mutable guest or pretend container restart reverted its VM. Installing/configuring this host is an explicit prerequisite, not an automatic modification of the user's workstation.

The job supervisor and result signer are trusted and outside the contributor process/container. Pure-module backend candidates run in a restricted child sandbox and return bounded function outputs; an independent supervisor computes expected properties. Candidate stdout is data, never a verdict. The signer/controller secret is inaccessible to the candidate. `process.exit(0)`, a spoofed passed JSON blob, missing case results or test-framework monkeypatching cannot satisfy the protocol.

Frontend candidates are built from the vetted template without worker scripts, served as client assets, and exercised by a trusted Playwright driver outside the candidate renderer. Use a per-job internal-only transport to the trusted asset server; candidate external egress and access to controller management are denied. Full-stack checks additionally permit a fixed per-job proxy to the sandboxed candidate API, as specified in COMPOSITION.md. Pure-module jobs remain network-none. No permitted transport reaches private stores, management endpoints or external networks. The driver judges observed DOM/interactions independently and signs results outside the renderer. Do not import untrusted React code into the trusted test runner's Node process.

Public jobs contain only released package bytes and public harnesses. Private jobs alone receive a minimal credential-free private integration bundle. Each has its own fresh VM and result provenance. Public diagnostic rendering verifies `jobKind=public` and cannot fall back to private output. Evaluation images are built only from vetted public sources; scan layers/history for private files and canaries. Pinning an image digest without this provenance check is insufficient.

Acceptance checks the owner session, latest non-superseded attempt, exact completed evaluation and unchanged private base. The same private DB transaction writes acceptance, candidate-diff hash, payable obligation and feedback outbox. Bridge replay/retry uses immutable event IDs; reconcile a committed acceptance after a crash without duplicating payment or losing its feedback.

Runtime `verify:mvp` checks product behaviour, artifact provenance and required isolation, not whether its own final coordinator audit is already marked done. M9.3 subsequently audits the execution packet. This avoids a circular requirement that the final task must already be complete before its checks can pass.

## Bounded automatic boundary creation

Within the supported TypeScript work-unit adapters, the planner compares an existing public interface with a checked extraction/parameterization candidate. The analyzer constructs a private proposed diff that turns protected data/rule calls into typed inputs, retains their computation in a private caller adapter, and exposes a generic responsibility. Apply transformations only to a temporary pinned snapshot and type-check/model-check the proposed boundary at M3.2. Generated-code preservation/integration execution is deferred to M4.3 after the M5 real-runner prerequisites; never execute arbitrary imported/model-generated source on the development host to satisfy an earlier milestone. Record the transformation and retained effort privately. The owner approves any internal restructuring separately from the exact external release. An unsupported dynamic/stateful transformation returns not_supported; neither AI confidence nor passing a small sample proves semantic equivalence.

At least one demonstration must start with direct coupling to the protected scoring/eligibility module and create a new parameterized boundary. A demonstration that packages only an already-isolated module does not satisfy the boundary-creation task. Generalize adapters over declared types/interfaces and approved obligations; PlanSelector and rankItems are examples, not permission to hardcode every request into those names.

## Composite task interfaces

COMPOSITION.md is normative for WorkUnit, PublicInterface, adapter registration, immutable union approvals and aggregate evaluation. PrivateIntegrationPlan maps each work unit and shared interface into one pinned private base; it records combined retained work and preservation obligations. Composed execution uses trusted fixed route/port profiles and a single authoritative aggregate result, with separate fresh public/private VMs. The application-policy adapter validates approved data files and never executes their contents as shell, CI, dependency or infrastructure instructions. Adapter registry IDs never accept contributor-controlled executable commands.
