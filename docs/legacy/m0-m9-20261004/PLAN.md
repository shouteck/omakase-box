# Implementation milestones and acceptance plan

This plan builds a working customer-hosted prototype, then prepares research evidence collection. It does not build or claim the full universal research vision. The normative product decisions are in `docs/SPEC.md`; security requirements are in `docs/SECURITY.md`.

## Progress

- [ ] M0: Foundation and reproducible fixture (implementation checked; refreshed independent review pending)
- [ ] M1: Contracts, state and authorization
- [ ] M2: Private requirements discovery
- [ ] M3: Boundary creation and private transfer planning
- [ ] M4: Approved deterministic task packages
- [ ] M5: Actual isolated evaluation infrastructure
- [ ] M6: Customer assignment and contributor portal
- [ ] M7: Private acceptance and payment obligations
- [ ] M8: Independent security and package readiness review
- [ ] M9: Integrated delivery and evidence-backed handoff
- [ ] M10: real research pilot, separately authorized; not part of the kickoff build.

## Milestones

| ID | Working outcome | Task cards |
|---|---|---|
| M0 | A fresh agent can install, inspect capabilities and start separate trusted services without private data. | [Detailed tasks](milestones/M0.md) |
| M1 | Every later feature shares versioned public/private contracts and enforced transitions. | [Detailed tasks](milestones/M1.md) |
| M2 | A PM can describe an outcome, inspect evidence and approve a resolved intent. | [Detailed tasks](milestones/M2.md) |
| M3 | Connected responsibilities form one task using typed adapters, with explicit interfaces and independent checks. | [Detailed tasks](milestones/M3.md) |
| M4 | Only exact approved content reaches a runnable external package. | [Detailed tasks](milestones/M4.md) |
| M5 | Hostile code runs only within the required disposable VM profile, with bounded results. | [Detailed tasks](milestones/M5.md) |
| M6 | A selected contributor can reserve, download and submit without private context. | [Detailed tasks](milestones/M6.md) |
| M7 | A qualifying patch becomes an auditable candidate change and fair payable record. | [Detailed tasks](milestones/M7.md) |
| M8 | Threat boundaries and complete-package behaviour survive independent adversarial checks. | [Detailed tasks](milestones/M8.md) |
| M9 | A fresh operator can run the prototype and see honest capability/research status. | [Detailed tasks](milestones/M9.md) |

## Dependency and handoff order

M0 establishes environment and synthetic evidence. M1 freezes shared types/auth/workflow. M2 adds private intake. M3 creates checked task boundaries. M4 binds approval and compiles approved content. M5 establishes the real isolated runner and may proceed alongside M2-M4 after its explicit prerequisites. M6 publishes approved tasks and receives bounded patches. M7 evaluates private fit and records owner acceptance. M8 independently challenges security/readiness and builds research instruments. M9 integrates and delivers. Exact task-level dependencies govern, not merely milestone labels.

The coordinator delegates ready nonconflicting tasks, requires a separate reviewer, records exact accepted revisions and passes their interfaces to successor agents. Read START.md for the complete loop. User-visible chat creation is not required for subtask handoff.

## Definition of delivered MVP

Single-unit tasks, a coherent full-stack feature, an executable codebase security-policy task and a combined frontend/backend/policy task complete the PM-to-private-acceptance workflow on synthetic fixtures. The combination requires passing and failing real-runner cases with one contract, package and acceptance; layer tags are nonexclusive. Unit checks alone cannot accept a composed task. Public/private storage and endpoints remain separate. Approval hashes, submission paths, budgets and stale revisions are enforced. Real constrained jobs run under the required isolated VM profile. Good patches pass; hostile patches fail safely. Payment obligations are recorded without claiming actual transfers. Fresh-install/e2e/security checks pass and operational instructions are accurate.

Demo provider operation must work without credentials. The real private provider adapter must pass protocol tests; if no customer-approved model is available, live verification is explicitly needs_configuration, not silently mocked. A missing mandatory VM gate keeps software delivery incomplete. Independent review is separately identified. Real PM/human studies remain unconducted until genuine records exist.

## Recovery and decision-making

The initial task graph/state is versioned. Resumption reconciles state against evidence; failed checks reopen affected work. Only the coordinator modifies shared progress. Routine scoped choices are recorded in docs/DECISIONS.md. New security guarantees, production deployment, external publishing, real payments or changes to product scope need actual user authorization, not an agent inference.

## Agent deliverables

Thirty-two bounded implementation tasks each specify role, write paths, dependencies, deliverables, commands and behavioural acceptance. The final agent provides a delivery report with pass/fail/unavailable results and an honest research status. No implementation is claimed by the existence of this packet.

## Task breadth and composition

A task is a customer outcome, not an exclusive frontend/backend category. It can contain multiple connected work units across software layers and other codebase disciplines. [Composition specification](docs/COMPOSITION.md) defines the unit/interface schemas, initial adapters, mandatory full-stack and security-policy examples, combined disclosure review and aggregate acceptance. M3.4 adds the bounded policy adapter; M5.4 adds composed-service execution and authoritative aggregate verdicts. The single kickoff instruction and M9 target remain unchanged.
