# Start or resume execution

When the user invokes this file to begin or resume work, including by giving only `START.md`, execute these instructions. No additional command or milestone argument is required. A request specifically to inspect, explain or edit this file is not an implementation kickoff.

## Objective

Build the prototype specified in this packet through the target in `tasks/task-graph.json` (currently M9). Work inside this directory, preserve this plan and create the product beside it. Implement the approved scope, test observable behaviour and save resumable handoffs. The user need not direct each milestone or repeat the target.

Use `.execution/state.json`, accepted handoffs and verified evidence to determine what is complete and what comes next. Start with the earliest eligible unfinished task, continue through all required tasks up to the declared target and their prerequisites, and resume rather than restarting completed work. Never change the target to bypass unfinished gates. M10 is separately authorized research and is excluded. If the target is already genuinely complete, verify the delivery record and report completion; do not begin additional features or research automatically.

## First actions

Read `AGENTS.md`, `PLAN.md`, `docs/SPEC.md`, `docs/COMPOSITION.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `tasks/task-graph.json` and `.execution/state.json`. Read the relevant milestone file before assigning a task. Prior conversation is unnecessary; the PDF is background, not the implementation instruction source. Use the defaults in the specification rather than asking the user to choose a stack. A task represents an outcome with connected work units; do not restrict it to an exclusive frontend/backend category.

M0 must establish tooling, environment capabilities, an isolated-runner profile and the commands promised by this plan. A command listed in a milestone is a required future project command; do not claim it already exists. The current packet contains no product source, runtime configuration or preinstalled product dependencies.

## Coordinator loop

1. Check current files and repository state. Resume recorded work; do not discard edits or restart completed tasks blindly.
2. Reconcile persisted state against handoffs and evidence. In normal multi-agent mode a task is eligible only when its prerequisites are `done`. The limited sequential fallback below has its own implementation-only rule; it never clears independent-review gates. A milestone completes only when all its task gates pass.
3. Assign the earliest eligible task to an implementation agent with its task card, specification sections, prerequisite handoffs, write scope and required evidence. Delegate independent ready tasks where tools and non-overlapping files permit. Serialize shared interfaces, migrations, dependency changes and integration.
4. The worker implements, runs the relevant checks and writes a draft handoff. It does not mark itself done.
5. Assign a separate reviewer to inspect the diff and evidence, challenge acceptance and rerun the decisive checks. Security-sensitive tasks require the reviewer to read `docs/SECURITY.md`.
6. Fix review failures, then record reviewer approval of the exact checked revision. Only the coordinator updates the canonical state to `done`, writes an immutable accepted handoff and proceeds to successor tasks.
7. Continue until the declared target passes or all remaining paths require a genuine external prerequisite. Do not stop after a task or milestone to ask whether to continue. Recompute eligible unfinished tasks after each accepted handoff; milestone labels alone do not replace the dependency graph.

Use at most the runtime's available concurrency. Prefer one coordinator, one or two workers, and a reviewer. Use built-in subagents for these subtasks; do not create user-visible chats automatically. Do not override the user's model settings. The exact dispatch message is in `templates/dispatch.md`.

If subagents are unavailable, implement sequentially and record each passing task as status `review`, implementationStatus `checked`, independentReviewStatus `not_available`. Successors may use these checked interfaces for implementation only when every prerequisite is done or implementationStatus=checked; never mark the prerequisite independently reviewed/done. Run meaningful tests, but leave the independent-review/final delivery audit open and projectStatus=implementation_checked_review_pending. A later distinct reviewer can approve the recorded exact revisions and clear the normal gates without rebuilding. This fallback does not approve any actual customer disclosure or claim pilot readiness.

## Interruptions and blockers

Before stopping, record current task, changes, checks, blockers and next eligible work in `.execution/state.json` and a draft handoff. Update state atomically through a temporary file and rename. Keep one coordinator as its sole writer. Do not erase a running lease based only on age; inspect the worker and its edits first.

Missing Docker/VM infrastructure blocks real runner validation, not unrelated UI and compiler work. Missing an authorized local model blocks live-model verification, not the provider adapter and clearly labeled demo mode. Record blocked tasks and continue independent tasks. Never substitute host execution, canned model results or fabricated participants for a required gate.

Routine reversible implementation choices within the specification are authorized by the kickoff instruction. Respect the host's actual approval controls. Ask only for a missing prerequisite, an action outside scope or a choice that would materially change the product. The plan is not permission to bypass approvals, publish repositories, release customer data, spend money, contact contributors or deploy production services.

## Required final report

Report completed and blocked tasks, exact run commands, local URLs, meaningful check results, remaining assurance limitations and the next research steps. Use separate labels for software delivery, real-runner validation, live-model verification, independent review and human-pilot evidence. A synthetic demo is not a validated business outcome. The research study in `docs/EVALUATION.md` is prepared by M9; actual participants require separate user authorization and participation.
