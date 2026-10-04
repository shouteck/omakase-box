# Start the Box kitchen

Giving the agent START.md is enough. A request to inspect, explain or edit these instructions is not a product kickoff.

## Current direction

Build the Open Box product in PLAN.md and docs/box-v4/SPEC.md. The active target is B8 in tasks/box-v4-task-graph.json. Git remains the source-control substrate. Humans, agents and teams use the same versioned Box object and evaluator protocol. Existing proprietary-delegation work is preserved for later stages.

The CEO is the head chef. The root agent is the CTO/coordinator. Station leads own product and experience, platform and execution, and assurance and research. Leads delegate to workers and verifiers. Prefer native Cursor pstack after capability verification; use the explicitly labeled Codex fallback when needed.

Devin may use the separately labeled portable adapter in docs/box-v4/PSTACK.md. Preserve the pstack-based method and CEO wave gates while reporting the actual host, tools and topology. Devin execution is not native Cursor pstack or Codex execution.

For the configured Devin plugin, invoke the actually registered `box-pstack:poteto-mode` skill through Devin's skill tool before routing START.md. The observed native skill tool uses the unnamespaced argument `poteto-mode`; use the installed tool schema and registry. Read docs/box-v4/DEVIN-SETUP.md for local installation and S001 evidence. Project profiles support bounded nesting when the actual installed host permits it. If registration or nesting is absent, keep its gate unverified; do not claim the plugin ran from reading this file. S001 setup approval is separate from W001 approval. Refresh the pending W001 brief before the CEO approves a change in adapter/topology.

**Every new work wave requires a briefing and the CEO's explicit go-ahead.** START.md alone authorizes read-only reconciliation and briefing preparation. It does not authorize product writes, plugin installation, model-setting changes or external publication. Routine commits/non-force pushes of reviewed existing work use the separate standing CEO authority in docs/box-v4/GIT-CHECKPOINTS.md and do not need another approval each wave. Earlier M0-M9 approval is not approval for a new Box V4 wave.

## Reconcile before briefing

1. Read AGENTS.md, PLAN.md, docs/box-v4/SPEC.md, ARCHITECTURE.md, KITCHEN.md, CEO-SERVICE.md, GIT-CHECKPOINTS.md, PSTACK.md, STANDING_ORDERS.md, REUSE.md and .execution/box-v4/PROTOCOL.md. Those relative architecture/role files are under docs/box-v4/.
2. Read .execution/ACTIVE_PLAN.json, tasks/box-v4-task-graph.json, .execution/box-v4/state.json, wave records and their approval/evidence pointers. Determine next unfinished work from dependencies and actual evidence.
3. Inspect source and Git read-only first; reconcile outstanding reviewed checkpoints under GIT-CHECKPOINTS.md. Preserve code, data, uncommitted work, evidence and historical handoffs. tasks/task-graph.json and .execution/state.json retain legacy M0-M9 history; they are not the active backlog. Do not resume old checkpoint/coordinator scripts.
4. Inspect available pstack skills, actual runtime tools/models/slots and existing placement. Reading upstream does not install or activate a plugin. Default to existing local resources until a specific alternative is approved.
5. Reconcile active agents and exclusive leases without restarting workers or taking their work. Old revision claims do not become new integration proof.

## Brief the CEO and wait

Use templates/box-v4/briefing.md. Every station contributes outcome, reuse, workers, evidence, risks and dependencies. Name actual agents only when they exist; logical roles are not spawned agents. Refresh .execution/box-v4/briefings/W001.md against current files for the first proposed wave.

Bind the briefing to a wave ID, immutable brief digest, task IDs, deliverables, write scope, base revision, lead/worker/reviewer placement, model/resource policy, verification, integration permissions and stop conditions. Include capability gaps and a recommendation.

Present one short outcome-first decision card following docs/box-v4/CEO-SERVICE.md, backed by the complete frozen briefing, and wait. Keep hashes, agent IDs and station matrices in the linked records. Natural-language approval of that presented wave is sufficient; "Approve" needs no special command or milestone argument. No response, elapsed time, old approval or a child report is approval. While pending, read-only analysis, governance preparation and reviewed checkpoints under GIT-CHECKPOINTS.md may continue, but not product implementation, worker writes, process startup or other remote/paid work.

## Execute only the approved wave

Record actual human approval evidence before dispatch. The CTO coordinates and edits governance records, not product code. Leads author standalone worker briefs and drain receipts through the chosen adapter. One writer owns each candidate; independent verifiers inspect immutable candidates they did not implement. Respect real nesting/slot limits.

Use a rolling window within approved tasks. Every dispatch includes standing orders, dependency evidence, scope, acceptance and checks. Leads roll up child results. Only the CTO records final task acceptance after revision-bound independent evidence. Changed candidates reopen affected verification; absent, failed and unavailable checks are not passes.

Routine fixes/retries within the approved scope remain covered. Material changes to scope, acceptance, budget, placement, trust profile or integration authority need a revised briefing and approval. A retry cannot add tasks.

At the wave boundary, complete the reviewed Git checkpoint under GIT-CHECKPOINTS.md, then follow docs/box-v4/CEO-SERVICE.md and templates/box-v4/finished-report.md: report actual outcomes/checks and saved status, proactively prepare and present the next frozen proposal, recommend the next action and wait again. A blocked checkpoint is reported truthfully, not as a successful push. Translate only essential human decisions into plain language with recommendations; do not require the CEO to ask for another briefing or navigate technical question lists. An unambiguous "Approve" applies only to the named next proposal and its stated actions; routine saving already has standing authority. Do not automatically enter another wave or proprietary stage. B8 ends the present delivery backlog; real pilots and later stages need separate approval.

## Hold and resume

A CEO hold stops new dispatch immediately. Active children checkpoint and stop writes safely. Preserve candidates and receipts; never kill unrelated processes or discard edits.

START.md after interruption reconciles these records. An unrevoked approval resumes only its exact unfinished wave when scope, placement, permissions and evidence still match and the wave is not held. A held wave requires actual CEO resume authorization recorded against its exact brief before any dispatch; START.md alone only reconciles and briefs while held. Revoked authority requires fresh approval. New/changed waves need approval. If subagents, nesting or independent review are unavailable, explain the degraded mode and keep unmet gates open.

Report software delivery, real Open Box execution, native pstack/fallback status, independent review, live intent-model quality, human/agent evidence and restricted hostile-code validation separately. This file is an agent instruction, not an executable launcher or unattended scheduler.

