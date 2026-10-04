# Open Box trust-profile contract (open_trusted)

Wave W001, approved by the CEO (verbatim message "Approve") at 2026-10-04T07:11:18Z against brief .execution/box-v4/briefings/W001.md revision 2026-10-04-r4, digest sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1. Approval record: .execution/box-v4/approvals/W001-approval.json. This authority covers B0.2 only; docs/evidence writes only; no product code.

Authored 2026-10-04 under adapter `devin_portable_pstack_adaptation`, base commit `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c` (master). This is a contract document, not an implementation; every capability statement below is a requirement on future waves, labeled observed/verified/unverified where it cites current state. It incorporates the Product station memo `.execution/box-v4/evidence/B0.2/product-input.md` (sha256:517e2b4f0838452566830614fb5fa5777f182331c36c041827f6935443b8f140, verified by recomputation on this host), in particular its section 3 "Product position — open_trusted vs restricted boundary in the UX".

## 1. Profile: open_trusted

`open_trusted` is the only execution profile the Open Box delivery may use. It exists only when all three of the following are deliberately approved (SPEC "Trust profiles"):

- **Approved synthetic/non-sensitive inputs.** The repository bound to a BoxVersion must be a deliberately approved synthetic or otherwise non-sensitive repository. Approval is a recorded human decision, not a property inferred from a path. The committed synthetic fixtures under `examples/**` are the current approved substrate (census row M0.3/`examples/` = reuse); a real Git-backed baseline is B1.2 scope.
- **Trusted pinned build/evaluator recipe.** Environment and evaluator run only as registered, pinned command graphs with fixed argument arrays and pinned tool/image digests. No arbitrary model shell strings, no candidate-supplied setup scripts on the host.
- **Explicit executor policy.** The human/agent/hybrid choice, identity scope and capability bounds are recorded per attempt before it can run.

`open_trusted` does not admit arbitrary strangers or secret-bearing code, and it never clears the restricted_private/hostile_external gates in section 3.

## 2. Executor policy

- The executor choice — human, agent or hybrid — is explicit per attempt. There is no AI-first default and no automatic executor selection; the assignments surface's posture ("No executor is selected automatically", `apps/private-console/assignments/assignments-screen.tsx`) is the pattern to reuse, not the bounty-coupled flow itself.
- An executor cannot approve desired behavior, and cannot approve its own review or merge. Behavior approval, independent review and merge authority are separate objects held by separate identities (SPEC: "Separate authors, assignees, independent reviewers and merge owners").
- Agent identities are scoped, short-lived and capability-bound: server-side tokens tied to one Box/attempt/capability, not session-equivalent accounts. Human sessions reuse the existing private auth (`packages/contracts/auth/**`, `services/private-api/auth/**`); box-scoped actions extend `AuthAction` in `packages/contracts/auth/policy.ts` rather than minting a parallel system.
- A simulator or demo executor adapter must be labeled and never counts as a real agent integration receipt; the same honesty rule already applied to planner providers (`modelVerification` labels) extends to executors.

## 3. What stays gated — restricted_private / hostile_external

The following surfaces belong to later restricted stages and are preserved unweakened. `open_trusted` must not route through them, weaken their guards, or present them as available on any Open Box screen or API response:

- `services/private-api/releases/**`, `services/private-api/readiness/**`, `services/private-api/ledger/**`, `services/private-api/acceptance/**` — restricted publication/readiness/payment/acceptance path (census A8; defer tasks M4.3, M7.x). `EvaluationAttemptSchema` (`packages/contracts/private/index.ts:33-40`) hardcodes `runnerProfile: 'dedicated-linux-kvm-fresh-vm'` — a different object from the Open Box `Attempt`; do not loosen it.
- `infra/runner/**`, `services/runner-controller/**`, `packages/runner-protocol/**` — hostile-runner surfaces. The dedicated Linux KVM/libvirt host is still absent (REUSE.md; `docs/runner-setup.md`; census M5.2). `open_trusted` does not clear that gate.
- `services/external-api/**`, `apps/contributor-portal/**` — external/bounty surface (census A6b; defer M6.x).
- Payment, disclosure and KVM-runner fields are not Open Box fields. No `open_trusted` UI may display payment, publication, KVM-runner or external-board affordances at all — not even disabled (product-input.md section 3, rule (d)).
- These screens already self-gate (owner-only readiness, `publicationReady` checks, "Real-runner evidence remains unavailable"). Restricted surfaces encountered by an Open Box flow render as "blocked — requires restricted_private profile, not authorized in this wave", never hidden or silently 403'd.

Profile transitions (open_trusted -> restricted) require a new reviewed design and CEO authorization; no wave can grant them implicitly.

## 4. Provenance and boundary-display requirements

Required on every Box/attempt surface (product-input.md section 3 "What users must see"):

- A visible profile label on every Box detail/list row: `open_trusted — approved synthetic/non-sensitive repository`. Users must never infer trust level from an absent gate.
- Executor policy and identity on each attempt (human/agent/hybrid plus scope).
- Provider provenance rendered at review time, not only at creation: mode (`demo` vs `ollama` live/`protocol_mock`), `modelVerification`, `repairAttempts`, `inputHash`/`proposalHash`. Observed gap (product-input.md section 5, Q8): `IntentCreation.provider` returns provenance at creation but `reviewProjection` does not render it — the Open Box review surface must.
- Bounded-context honesty: what the service actually read — snapshot/repository hash, file count, truncation flags, `imageUnderstanding: false` — kept visible per Box.
- Blocked-with-reason states, never silent gates: unresolved required decisions, unsupported capabilities, missing evaluator/environment, stale-version/hash mismatches. Existing precedent is the house style: `blockage.requiredUnresolved`, publish-gate reason codes, `provider_unavailable {reason, mode}`, `(tested)`/`(unverified)` labels.
- No payment/publication/KVM/external affordances on open_trusted screens, even disabled (section 3).

## 5. Workspace policy

- Candidate, repository and generated code run only inside the declared approved workspace — the reviewed local Dev Container/Docker recipe (`infra/trusted.Dockerfile`, `infra/compose.yaml`, `templates/workspaces/**`; B3.1 scope) — never directly on the host workstation.
- Host execution is limited to reviewed Git/bookkeeping tooling. The existing compose services already run non-root, read-only, `cap_drop: ALL`, `no-new-privileges`, bounded memory/CPU/pids with internal networks — observed configuration, not a claim of hostile isolation.
- Bounded resources on the present 16 GB Windows host: heavy checks serialize; no unnecessary credentials, daemon mounts or egress in the workspace recipe.
- Git worktrees and sparse checkout are context mechanisms, not confidentiality boundaries.

## 6. Open decisions (verbatim from product-input.md section 5)

Source: `.execution/box-v4/evidence/B0.2/product-input.md` (sha256:517e2b4f0838452566830614fb5fa5777f182331c36c041827f6935443b8f140), section "5. Unresolved product decisions — named, not guessed". Copied verbatim; this contract does not resolve them.

- **Q1 — Conversation model: single-shot proposal+decisions vs persisted multi-turn.** Options: (a) keep the revision+decisions model and treat each revision as a turn record (minimal new code, weak "conversation" semantics); (b) new persisted conversation/turns aggregate whose turns can update the behavior draft (matches SPEC step 2 "persisted conversation" literally). Recommendation: (b), reusing decisions/revision mechanics as the turn-transition primitives. Unblocked by: B0.2 contract decision on whether conversation is its own aggregate; feeds B2.1 scope in the next brief.
- **Q2 — Is the behavior artifact distinct from the intent record?** Options: (a) promote `InternalIntent` to be the `behaviorArtifact` referenced by `BoxVersion.behaviorArtifact/hash` (max reuse; couples artifact shape to legacy schema); (b) emit a separate immutable artifact at approval, with the intent record as provenance (cleaner SPEC match; new schema). Recommendation: (b). Unblocked by: B0.2 Platform contract doc + CEO sign-off on artifact boundary.
- **Q3 — Who approves behavior vs who approves merge.** Current: `owner` role does both legacy jobs (intent approve; acceptance/release approve). SPEC: "requester/owner approves the exact behavior artifact"; merge needs owner authority + reviewed candidate. Options: same owner for both; or requester approves behavior, owner approves merge. Recommendation: keep both actions owner-role initially but record them as separate approval objects so the roles can diverge later. Unblocked by: profile-contract + role decision in B0.2/W002 brief.
- **Q4 — Console and Box Web: one app or two.** Options: extend `apps/private-console` with `boxes/**` (ARCHITECTURE.md's placement; one auth/session surface) vs a separate Box Web app (matches SPEC's "Box Web" wording; more bootstrap/auth work). Recommendation: extend the existing console for the first Box surface; split only if a contributor/agent-facing surface later needs different trust. Unblocked by: W002 scope naming the app target.
- **Q5 — Demo vs live-model labeling and use.** Current labels are honest (`modelVerification: 'not_applicable' | 'protocol_mock' | 'live_response_not_validated'`) but the provider mode is not shown on the review screen. Options: ship demo-labeled-only in the first Box wave and gate `ollama_live` behind an independent model-quality check; or allow live output with prominent labels. Recommendation: demo-only for W002's first Box surface; add a provenance line to the review UI (small new code) regardless. Unblocked by: model/resource policy in the next brief + whether B2.1 requires live-model evaluation.
- **Q6 — Full-stack decomposition of the first demo Box.** SPEC requires a coherent UI/API feature Box, a separate application security-policy change, and one connected multi-discipline Box. Open: which `examples/**` fixture (19 files, census "reuse") and which demo-fixture goal becomes the first Box; whether the planner's partition suggestion is surfaced to the customer ("the customer decides whether a coherent feature should remain one Box"). Recommendation: one coherent full-stack feature Box first, planner suggestion shown but never auto-split. Unblocked by: synthetic-repo baseline decision (B0.2 Platform) + W002 demo-script choice.
- **Q7 — Orphaned `needs_decision` state.** The transition table, schema and UI label support it, but no orchestrator path sets it. Options: wire an explicit needs-decision transition (clarifies state machine), or drop the state and keep `blockage.requiredUnresolved` semantics. Recommendation: wire it during B2.1 conversation work — it maps naturally to "clarification pending". Unblocked by: Q1's conversation-model decision.
- **Q8 — Where provider provenance is displayed.** `IntentCreation.provider` is returned at creation but absent from `reviewProjection`/UI. Options: add provenance fields to the projection (small schema + UI change) vs leave provenance on creation responses only. Recommendation: add to projection — SPEC's labeling requirement applies to review-time decisions, not just creation. Unblocked by: any wave approving intents/review projection edits.

## 7. Decisions this contract depends on

- This contract takes a position only on the boundary, not on Q1–Q8 themselves. It does require the profile label, executor-policy display and blocked-with-reason style of sections 3-4 regardless of how Q1/Q2/Q4 resolve.
- Q3 affects who may hold behavior-approval and merge-approval actions in `packages/contracts/auth/policy.ts`; this contract requires only that the two approvals remain distinct objects (its section 2).
- Q5 affects whether live-model output may appear on the first Box surface; this contract requires the provenance labeling of section 4 in either case.
- Q6 affects which synthetic repository is the first approved input under section 1; the W002 brief must name it explicitly.
