# W002 / B1.1 — worker receipt (candidate, not acceptance)

## Identity and authority

- Wave W002, task B1.1 (`versioned open box aggregate and transitions`), plan `box-v4-2026-10-04.1`, adapter `devin_portable_pstack_adaptation`.
- Brief `.execution/box-v4/briefings/W002.md` revision `2026-10-04-r1`, SHA-256 `44e984be1e01abfed357945f196f16738e30c43de1e5bb0e2adcdc891d5a7ac9` (recomputed by `scripts/briefing-digest.mjs` equivalent path; matches `approvals/W002-approval.json`, human message `Approve`, observed `2026-10-04T08:35:06.1650860Z`).
- Approved base `cd3feaf0c467df6c4b9734974722f8471f0da891` (`master`). No commits/pushes performed by this worker; working-tree diff only.
- Wave status `approved`; no hold/revocation events observed.

## Candidate file list (SHA-256 — see candidate-manifest.txt)

Exclusive B1.1 paths written:

- `packages/box-contracts/index.ts` — typed zod contracts: `BehaviorArtifact`, `BoxVersion`, `Attempt`, `EvaluationReceipt`, `Assignment`, `ReviewDecision`, `MergeRecord`, `TrustProfileSchema` (`open_trusted` only), version/attempt transition tables (`assertBoxTransition`), `assertNoRestrictedFields` (payment/reward/disclosure/KVM contamination refusal). Behavior artifact is a distinct persisted object carrying intent as provenance only.
- `packages/box-contracts/package.json` — workspace package `@private-task/box-contracts` (zod 4.6.5, already locked; no lockfile change).
- `services/private-api/boxes/store/schema.ts` — Drizzle table definitions colocated under the Box store tree (not added to global `db/schema.ts`).
- `services/private-api/boxes/store/store.ts` — `BoxStore`: transactional create/revise/read, `approveBehavior` (owner-only, bound to exact content hash + behavior artifact hash, executor self-approval refused via assignment check), `transition` (open requires approval row), `assign` (owner-only, optional scoped-token mint), `openAttempt`/`submitAttempt` (session or scoped-token executors, capability + box/attempt scope checks, maxAttempts), `recordEvaluation` (operator permission or `attempt.evaluate` scoped token, bound to attempt env/evaluator digests and exact version hash), `review` (reviewer≠executor, candidate hash = submitted patch hash), `approveMerge`/`applyMerge` (owner merge approval as separate object, executor self-merge refused, merge target/base-commit binding). Server-side session+CSRF revalidation and `permits()` checks inside every transaction; `FOR UPDATE` optimistic head/attempt reads; `box_operation_keys` idempotency (same key+same request replays, same key+different request rejected).
- `services/private-api/db/migrations/0012_open_box_foundation.sql` — migration idx 12: artifacts, versions(+heads), behavior approvals, assignments, scoped tokens, attempts, evaluation receipts, review decisions, merge approvals, merge records, operation keys; immutability triggers (`box_record_immutable`, content-immutability for versions/attempts); format CHECKs for hashes/digests; `open_trusted` profile CHECK on payloads; no payment/disclosure/KVM columns.
- `services/private-api/db/migrations/meta/_journal.json` — entry idx 12 appended (no snapshot regenerated).
- `tests/box/contracts/box-schemas.test.ts` — schema validation, contamination refusal, artifact/intent separation, transition table.
- `tests/box/contracts/boundary.test.ts` — asserts `scripts/boundaries.mjs` forbids `packages/box-*/` and `@private-task/box-contracts` on the external side (probed against the real module in a child process).
- `tests/box/auth/support.ts` — synthetic in-process fixtures: per-file fresh PostgreSQL database, real drizzle migration through 0001–0012, synthetic account/session rows.
- `tests/box/auth/box-store.test.ts` — happy path (artifact→version→owner approval→open→assign→agent attempt→submit→receipt), stale/foreign-id/illegal-transition rejection, non-owner edit rejection, approval invalidation on revise.
- `tests/box/auth/roles-merge.test.ts` — executor self-review refusal, separate merge approval object, executor self-merge refusal, independent reviewer bound to candidate hash.
- `tests/box/auth/scopes-idempotency.test.ts` — scoped agent token scope/capability enforcement, invalid token rejection, idempotent replay and same-key-conflict rejection.

Shared leased paths modified:

- `package.json` — added `test:box-contracts`, `test:box-auth` (suite.mjs convention, no version/dependency change).
- `packages/contracts/auth/policy.ts` — appended box actions to private role permission lists (`box.read/write/behavior.approve/assign/attempt/review/merge.approve/token.create`); external permissions unchanged.
- `scripts/boundaries.mjs` — added `packages/box-` to forbidden private prefixes checked on the external side.
- `scripts/vitest.config.mjs` — added `testTimeout: 30000` (the pre-existing `private-api` bootstrap health test legitimately takes ~7.3 s under the approved 2-CPU isolated container and exceeds the 5 s vitest default; no assertion/expectation was changed).

## Runtime environment

- Docker Desktop engine 29.8.1, context `desktop-linux`. No pulls, no global settings changes.
- Workspace container `w002-b11-ws`: cached image `sha256:99fc47…65c9` (`ptm-deps-check`), `--user 1000:1000`, `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--memory 2g --cpus 2 --pids-limit 256`, tmpfs `/tmp` 512m, bind mount = disposable staged source dir only (excludes `.runtime`, `.env*`, `.git`, credentials). Node v24.11.0.
- DB container `w002-b11-db`: `postgres:17-bookworm@sha256:639ab7…b652`, `--memory 256m --cpus 0.5 --pids-limit 128`, tmpfs data dir, synthetic per-run password (env only, not committed). Internal network `w002-b11-net` (`--internal`, no egress, no published ports).
- Staged node_modules: image toolchain `node_modules` copied container-side (`cp -a` preserves pnpm symlinks); per-package `node_modules` relinked inside the container to the image `.pnpm` virtual store (workspace-link metadata only; `pnpm-lock.yaml` untouched).
- `BOX_TEST_DATABASE_URL` points at `w002-b11-db` inside the internal network.

## Commands actually run (inside `w002-b11-ws`, `/workspace`)

| Command | Exit | Result |
| --- | --- | --- |
| `node scripts/pnpm.mjs test:box-contracts` | 0 | 7/7 tests passed (box-schemas 6, boundary 1) |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 7/7 passed; real migrations 0001–0012 per test DB; happy path, stale/foreign/illegal transition, self-review refusal, self-merge refusal, scoped-token enforcement, idempotent replay all exercised against real PostgreSQL |
| `node scripts/pnpm.mjs build` | 0 | tsc + vite builds for private-api, external-api, runner-controller, private-console, contributor-portal, private-shop completed |
| `node scripts/pnpm.mjs check` | 1 | tsc clean; boundary check passed (59 files); bootstrap suite passed 14/14; **auth suite: 25/30 passed, 5 failed — all environment-dependent**: `browser-cookie` needs Playwright chromium (`PLAYWRIGHT_BROWSERS_PATH` = `.runtime/browsers`, excluded per no-secrets/no-download policy), four `persistence/*-live` tests spawn the legacy compose runtime via `scripts/docker.mjs` (no Docker socket inside the isolated workspace). No code regression observed; contracts/planner suites not reached after the auth failure |
| `node scripts/pnpm.mjs test:auth` | 1 | Same auth suite result: 25/30 passed, 5 environment-dependent failures as above |

## Limitations and honest gaps

- `check` and `test:auth` did not pass: failures are confined to tests requiring the host compose stack and a downloaded Playwright browser, both unavailable inside the approved isolated workspace (no egress, no docker socket, `.runtime` excluded). Passing them needs either the approved compose runtime (not started per W002 isolation) or a cached browser image — record as environment-unavailable, not a pass.
- The `testTimeout: 30000` change is a tooling accommodation for container slowness; the private-api health test itself is unmodified and asserts the same literal output.
- G5 (resume) not demonstrated here — worker rece
