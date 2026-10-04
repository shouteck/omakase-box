# Session record 2026-10-03 (opencode coordinator, START resumption)

Pending inclusion in `docs/DECISIONS.md`: that file is hashed into every task revision manifest
(`sharedPaths`), so it may only be edited immediately before a revalidation sweep. Fold this record
into `docs/DECISIONS.md` at the start of the next shared-file sweep, then re-record all affected
revisions and re-run `node scripts/audit-execution.mjs`.

## Decisions

- Subagent implementation workers and a distinct reviewer agent are available in this runtime, so
  M2.3 and M3.1 resumed under worker/reviewer separation instead of the sequential fallback.
- Coordinator applied the trusted private build stage's planner COPY/allowlist
  (`packages/planner/prompts`, `packages/planner/providers` in `infra/trusted.Dockerfile` and its
  dockerignore) because the M2.3 intent orchestrator imports the M2.2 provider modules inside the
  private API image. The canonical synthetic runtime was rebuilt, restarted and migrated, and every
  previously checked/blocked task was revalidated by re-running its own mandated suites (frozen
  install, check 234, build, doctor, auth 40, contracts 144, workflow 10, planner evidence 8,
  planner provider 28, security evidence 23, prompt-injection 6, authorization 19, runner protocol
  39) before fresh manifests were recorded.
- One restart of the identified synthetic processes was required before each login-heavy suite run
  because the existing 20-login/5-minute per-IP policy is held in service memory. No policy, data
  or volume change was made.
- `scripts/execution.mjs` was deliberately NOT modified: its manifests hash `scripts/**`, so any
  edit would invalidate every recorded revision. Reviewer decisions are recorded by the
  coordinator-only `.execution/review.mjs`, which lives under `.execution/` (excluded from revision
  manifests), refuses a reviewer identical to the coordinator or implementing owner, and requires a
  reviewer report binding the exact revision digest.
- The distinct reviewer agent independently approved M2.3 at exact revision
  `dd85c640c1dfb18036613e9964b0be4846703a3284f5a033efef575350e20fc9` after re-running e2e intent
  6/6, contracts intent 22/22, security authorization 19/19 and tsc. It is recorded with
  `independentReviewStatus: verified` and an immutable accepted-handoff copy. Its status stays
  `review` rather than `done` because prerequisite tasks M0.1-M2.2/M5.1 are not yet independently
  reviewed (the packet audit requires `done` to imply all dependencies `done`). Re-running
  `node .execution/review.mjs M2.3 opencode-reviewer-subagent approved ...` after those
  prerequisites are reviewed promotes M2.3.
- Reviewer-noted follow-ups kept open: approval traceability records the revision creation time as
  `approvedAt`; M0.1-M2.2/M5.1 independent review, real isolated runner, live model and human-pilot
  gates remain open.
- M3.1 delivered `packages/analyzer/**` (pinned-byte, execution-free AST/import-closure,
  edit-surface and conservative classification analysis with `computed`/`unknown` verdicts that
  never include `safe`) plus the first-owner `tests/analysis/**` and
  `tests/security/dependency-boundary/**` suites with no shared-file or dependency change.
- The historical coordinator identity string `devin-coordinator-sequential` is retained by
  `scripts/execution.mjs` for manifest consistency; this session is the opencode coordinator.

## Current state

- M2.3: implementation checked, independently reviewed (verified), status `review` pending
  prerequisite reviews. Accepted handoff:
  `.execution/handoffs/M2.3-dd85c640c1dfb18036613e9964b0be4846703a3284f5a033efef575350e20fc9.md`.
- M3.1: implementation checked, revision
  `fa843c512ff8af860e25afab6966c1a60a2180ec5ea0ad4debfdff4023262a1f`, status `review`, independent
  review open.
- M5.2 remains blocked on a dedicated Linux KVM host and reviewed guest supervisor.
- Implementation-eligible next: M3.2, M3.4, M5.3.
- Packet audit passes.
