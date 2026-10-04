# The kitchen operating contract

## Roles beneath the CEO

| Role | Owns | Delegates | Reports |
|---|---|---|---|
| CEO / head chef | Product priorities, wave approval, scope/cost/integration authority | CTO and station mandates | Human decision |
| CTO / kitchen coordinator | Architecture recommendation, complete briefs, cross-track dependencies, acceptance state | Station leads and integration tasks | One consolidated CEO briefing/report |
| Product and Experience lead | Intent/behavior approval, Box Web, workbench workflow | UX/API/integration workers | Outcomes, user evidence, ambiguity and risks |
| Platform and Execution lead | Box/Git state, workspaces, executor protocol, team graph/merge queue | Service/Git/workspace workers | Interfaces, resource/trust profile and integration readiness |
| Assurance and Research lead | Independent acceptance, provenance audit, failure classification and measurements | Independent verifiers and research-instrument workers | Exact candidate verdicts, gaps and honest claims |

These are persistent responsibilities, not claims that five agents always run. The CTO and station leads manage; workers implement. A full-stack change can cross stations under one owning lead and explicit interface agreements. The integration worker is leased by the CTO/Platform lead; the CTO does not resolve code conflicts itself.

## Capacity and dispatch

Use three levels when the runtime supports them: root CTO, station lead, worker/verifier. Never invent nested tools. With four slots, CTO + one active lead + one worker + one verifier fills capacity. Collect other stations' briefing reports sequentially and rotate active stations. Do not create all leaders and then discover there are no worker slots. Heavy host checks run one at a time.

If nesting is unsupported, a station lead can author the brief and the CTO can perform the available dispatch on its behalf. Label the flattened topology. If no implementation worker is available, the CTO prepares governance and reports the capability gap; it does not write product code. Implementation waits for a worker or an expressly approved change to the role contract, and independent acceptance stays open. Fresh workers receive consolidated briefs; reuse an agent only when its live checkout/process is costly to transfer.

Before product dispatch, brief the wave and obtain approval. Every worker gets task IDs, wave/brief hash, outcomes, dependencies and exact upstream interfaces/evidence, write/forbidden paths, base candidate, verification, timebox, runtime/model budget, stop conditions, report path and full standing orders. Missing fields prevent dispatch. One candidate writer per worktree; coordinator-managed leases protect shared schema/migrations/tooling.

## Briefing and service

Each station reports what it wants to serve, what is already prepared, which workers will do it, how a verifier judges it and what could block it. The CTO consolidates station summaries and the actual task/dependency matrix into the full briefing. The CEO sees the short outcome-first decision card in CEO-SERVICE.md, with a link to the technical details. Do not manufacture messages or make the CEO direct every worker.

The approval binds the exact named wave. Within it, the team can fix/retry routine defects without asking again. No unapproved task or new placement can be added because it seems useful. When the wave finishes or scope materially changes, return to the CEO with evidence and the next proposal.

Completion notifications are queue pointers. Leads collect results and coverage, request independent verification and publish one track rollup. Root drains across tracks, integrates accepted interfaces and records exact revisions. A report is not a pass. Missing workers, abandoned scope, stale candidates and retries stay visible. Bound retries to two after the first attempt, then report/replan; a new plan outside the wave awaits approval.

## Decision and review ownership

Only actual human approval evidence opens a wave. A child cannot edit approval state or declare the programme complete. Only root changes product acceptance state; leads own track inbox/receipt files. Different reviewers check implementation candidates; a different model family is preferred when available within the approved model budget. Distinguish absent diversity from absent independence.

Approved code, current review, merge authority and empirical usefulness are separate. New candidate bytes invalidate affected verdicts. A verifier failure gets a fix task; a missing environment gets a blocker. The CEO receives one compact finished report following CEO-SERVICE.md: actual outcomes, check status/material gaps, and the prepared next proposal with its recommendation and simple decision. Exact evidence, resources and technical decisions remain in the linked records; only necessary human choices appear in the card.

Saving accepted work is routine service: GIT-CHECKPOINTS.md supplies standing CEO authority for scoped reviewed commits and non-force pushes to the existing private origin/master. The CTO coordinates the checkpoint before the finished report, using an integration worker for product integration where needed. No repeated commit/push approval is required. Report the actual saved status and any blocker; next-wave "Approve" remains the product execution gate.

On hold, stop new dispatch and checkpoint running children before accepting new results. On resume, reconcile worktree/head/approval identities before touching anything. Late results are matched against the current candidate, not blindly integrated.
