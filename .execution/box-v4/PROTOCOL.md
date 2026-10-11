# Wave, evidence and state protocol

## Sources of truth

`.execution/ACTIVE_PLAN.json` selects the B-series graph/state. The graph owns dependencies/acceptance. `state.json` owns current task status and wave pointers. Each immutable wave brief and its approval record own execution authority; task state cannot invent approval. Receipts/reviews bind exact candidates. Native pstack state is dispatch bookkeeping, not product authority. The old graph/state and archived instruction snapshot are retained history.

The CEO's 5 October delegation refocus is specified in docs/box-v4/DELEGATION-MAP.md and tasks/box-delegation-task-graph.json. Keep the active selector and canonical B state intact while W002 is owned. At a safe boundary, the next approved D wave explicitly transitions the selector and registers D statuses while preserving B history and external prerequisite evidence. Do not create a second competing execution root, reset existing acceptance or treat the planning request as D implementation approval.

Only the root CTO writes active state/approval indexes. Leads write their assigned inbox/receipt/rollup files; workers write candidates and their own receipts. Replace mutable JSON atomically using a unique temporary sibling and rename. Keep immutable approved briefs, approvals, receipts and reviewer reports append-only. A report claiming human approval is rejected unless backed by actual human input.

## Wave states and approval

Wave states are proposed, awaiting_ceo, approved, executing, reviewing, completed, held, changed, abandoned. Initial W001 is awaiting_ceo with no approval. CEO natural-language approval must identify the currently presented wave; record the message/evidence reference and exact brief digest, scope, author and timestamp. Never fill those fields from a model's inference. A blank/pending approval cannot transition to executing.

Approval binds plan version, wave ID, immutable brief, task IDs, paths, candidate/base, roles, runtime placement, model/concurrency/cost policy, verification, integration destination/actions and stop conditions. A wave can approve read-only/design work without product writes. Material changes create a new brief revision and invalidate execution authority until approved. Routine fixes within that unchanged scope remain covered.

Hold/revocation stops new dispatch and instructs active children to checkpoint safely. Persist the actual hold/revocation evidence. Held waves require a new human resume authorization against the same brief before dispatch, even if approval was not revoked. Revoked authority requires a fresh approval. On resumption, verify there is no unresolved hold and candidate/scope/placement still match. START.md alone cannot clear a hold. An old wave approval is not authority for the next wave. Completed waves trigger reports and proposed next briefs only.

## Tasks and leases

Task statuses are pending, ready, running, checked, reviewing, changes_requested, accepted, blocked, deferred. Every task has implementationStatus and independentReviewStatus. Accepted requires all required prerequisites accepted, actual output/check evidence, exact independent review and any integration authority. Existing component-level evidence may support implementation but cannot auto-accept new outcomes.

A wave may approve bounded provisional interface design before a predecessor is accepted, but it cannot mark the downstream acceptance complete. Otherwise select ready tasks by accepted prerequisites. Workers never edit canonical state. One writer owns each candidate/worktree; shared tooling/schema/migration edits need a coordinator integration lease and revalidation of affected users.

## Receipts and verification

Store receipt/review pointers under `.execution/box-v4/evidence/<task>/`. Bind wave/brief hash, exact candidate commit or complete content manifest, affected interfaces, environment/evaluator hashes, commands actually run and observations. Typecheck-only is not behavioral acceptance. Record live/runtime tests and bounded assumptions separately. A distinct verifier reviews the candidate; preferred model diversity is reported truthfully. Without independent review, implementation may be checked, never accepted.

A changed scoped candidate, environment, evaluator or merged result invalidates affected reviews. Preserve previous verdicts as history. Do not accept a current reviewer signature for different bytes by bulk metadata re-snapshotting. Failed, missing and unavailable checks cannot pass. All genuine current prerequisites/host capabilities remain visible.

## Legacy reconciliation

Do not run legacy `scripts/execution.mjs`, `.execution/coordinator.mjs`, checkpoint or review scripts for B IDs. They read hardcoded legacy state/graph and can overwrite historical statuses. A future B0-approved tooling adaptation may supply new atomic bookkeeping; until then use the readable protocol and actual file tools. No new runtime/bookkeeping implementation is supplied by this planning revision.

Keep `.execution/state.json` and `tasks/task-graph.json` unchanged. Legacy accepted component/revision history can be reused after current content/interface checks. Old review claims and later source drift must be reconciled in B0, not reset or declared solved by a new JSON file.

## Integration and close

Integration is a scoped worker task. Local reviewed synthetic merges can be approved in a wave; remote/shared-target operations require destination authority. docs/box-v4/GIT-CHECKPOINTS.md supplies the CEO's later standing authority for routine scoped reviewed commits and non-force pushes to the existing private origin/master, including a post-W001 checkpoint. No repeated wave-specific checkpoint approval is required. Other destinations/actions still require separate authority. One lease per merge target. New target/base changes require merge-result checks and affected revalidation. Record actual Git history and provenance, not a promised future commit. Historical approved briefs and reviews remain immutable; record later checkpoints under their actual standing authority.

At close account for all children/candidates, reconcile queue gaps and late results, checkpoint scoped reviewed work under GIT-CHECKPOINTS.md, report accepted/checked/blocked work, capabilities and actual saved status, and keep the next wave pending. A failed checkpoint remains a blocker; it cannot manufacture a successful push or invalidate truthful reporting of already accepted delivery. B8 software closure excludes real participant studies and later restricted stages. Session limits require a durable handoff, not fabricated unattended continuation.
