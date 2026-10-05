# D1.2 first implementation brief: Prepare and Approve a Box

Wave context: designed under W003 revision 2026-10-05-d1.1-r3 (task D1.1). This is an implementation-ready plan for a **separately approved** D1.2 wave. Nothing here authorises coding now; D1.2 waits for its own briefing and CEO approval. Preparation is not assignment, execution or bounty publication.

Target: task D1.2 "Prepare a versioned Box from a work request and completion agreement" in tasks/box-delegation-task-graph.json (dependencies: D1.1, B1.1 — B1.1 accepted, see cto-acceptance-h1.json).

## Deliverable behavior (grounded in accepted interfaces)

Primary flow for both supported requests:

1. Register the fixture once through `POST /v1/box-repositories` with configured `sourceId:"private-shop"`, real 40-hex `baseCommit`, `environmentRef`, `evaluatorRef`, `mergeTarget`, and the context manifest described below. That route creates the selected-source snapshot, provenance row and registry row in one transaction.
2. Create the work request through existing intake: `POST /v1/requests` with `snapshotId`, `goal`, optional `currentBehaviour`/`desiredBehaviour`, `constraints`, and `exclusions`. A pasted issue is request text/provenance only; no external fetch or tracker connector exists.
3. Create the required internal intent draft through `POST /v1/requests/:id/intents` with `mode:"demo"` as the deterministic floor. Resolve required decisions through `POST /v1/intents/:id/decisions`, mark ready through `POST /v1/intents/:id/readiness`, and obtain owner intent approval through `POST /v1/intents/:id/approval`. The resulting `{intentId, intentVersion, contentHash}` is the `IntentProvenance` embedded in the Box.
4. `POST /v1/boxes/prepare` takes `{requestId, repositoryId, supportedCaseId, operationKey}`. It verifies the approved intent revision belongs to the request, resolves the registered repository row, derives the supported-case artifact deterministically, and calls `BoxStore.createPrepared` so artifact+version+operation key land in one transaction. It returns a `BoxAgreementProjection`. The same operation key and identical request returns the recorded result; a different request with the same key fails.
5. The owner reviews `GET /v1/boxes/:id/agreement`, then calls `POST /v1/boxes/:id/behavior-approval` with `{expectedVersion, expectedHash, approvalId, operationKey}`. This maps directly to `BoxStore.approveBehavior`; only the owner role may pass.
6. `POST /v1/boxes/:id/readiness` calls `BoxStore.transition(..., 'open')` only after exact-version approval. The response reports open only when the store transition succeeds; a missing approval or omitted consequential decision remains blocked.
7. `POST /v1/boxes/:id/revisions` calls `BoxStore.revisePrepared` with the next version and returns `approvalInvalidated: true`; `GET /v1/boxes/:id/agreement` exposes `supersededApproval` so the owner sees that a changed agreement needs fresh approval.

Observable Box fields are the exact contract fields: `repoId`, `baseCommit`, `intent` provenance, `behaviorArtifact`, `contextManifest`, `editableSurface`, `environmentRef`, `evaluatorRef`, `disciplines`, `workUnits`, `interfaces`, `requirements`, `endToEndObligations`, `attemptPolicy`, `executorPolicy`, `mergeTarget`, and `artifactHashes`. Request A gets `editableSurface:["config/response-security.json"]` and `disciplines:["backend","security"]`; Request B gets `editableSurface:["src/ranking/rankItems.ts"]` and `disciplines:["backend"]`. Each has one `workUnits` entry matching the single outcome. Both use `attemptPolicy:{maxAttempts:2, allowedExecutorKinds:["human","agent","hybrid"]}` and `executorPolicy:{explicitChoiceRequired:true, allowSimulatorLabelled:false}`. `mergeTarget` is `{reference:"owner-private-shop", branch:"main", expectedCommit:<registered baseCommit>}`. `artifactHashes` binds `agreement`, `context-manifest`, and `evaluator` keys to their exact hashes.

Route permissions use existing actions only: `snapshot.import` for `POST /v1/box-repositories`; `request.write`/`intent.write`/`intent.approve` for the existing intake and intent calls; `box.write` for prepare/revise/readiness; `box.read` for the agreement projection; `box.behavior.approve` for behavior approval. No new auth action is added.

The concise owner agreement card uses a new `BoxAgreementProjectionSchema`, modeled on `ReviewProjectionSchema` but Box-specific. It shows goal, facts with evidence, required unresolved decisions, assumptions, unknowns, acceptance examples, included/excluded scope, runnable closure versus explanatory context, editable paths, owner patch mapping, base commit, environment/evaluator refs, merge target, approval hash, and stale approval status. Chat remains optional; no handwritten technical spec is required.

## Exact integration paths

Proposed write scope (these become the lease when the D1.2 wave is approved; the registry migration/schema row is a required addition outside the current graph globs and must be named in that approval, not before):

| Purpose | Path | Status |
|---|---|---|
| Contracts | `packages/box-contracts/index.ts` for read-only reuse; `packages/box-contracts/package.json` only if the approved wave adds exports | exists, accepted |
| Preparation service + routes | `services/private-api/boxes/preparation/orchestrator.ts`, `services/private-api/boxes/preparation/routes.ts`, `services/private-api/boxes/preparation/types.ts` | proposed new files |
| Repository registry persistence | `services/private-api/db/migrations/0013_delegation_preparation.sql`, `services/private-api/db/migrations/meta/_journal.json`, and `services/private-api/boxes/store/schema.ts` | proposed shared-lease addition; required because no existing table persists `baseCommit` with a repository/source manifest. The journal gets the next index-13 entry; current convention has no per-migration snapshot after index 1, so no `0013_snapshot.json` is assumed |
| Box lifecycle calls | `services/private-api/boxes/store/store.ts` — add bounded `createPrepared`/`revisePrepared` wrappers that insert artifact+version atomically and reuse the existing `create`/`revise` guards; reuse `approveBehavior`, `transition`, `read`; add only registry methods needed by the new table | exists, bounded edit |
| Route installation and root source config | `services/private-api/src/bootstrap/server.ts` alongside existing `installX` calls, wired through `authHandlers`/`requirePermission`; `services/private-api/src/bootstrap/main.ts` to register `{id:"private-shop", root:"/workspace/examples/private-shop", paths:fixture.snapshotPaths}` for the reviewed fixture | exists, bounded edit points |
| Existing intake/intent seams | `services/private-api/requests/routes.ts`, `services/private-api/intents/routes.ts`, `services/private-api/db/intent-store.ts`, `services/private-api/snapshots/importer.ts` | exists, no rewrite |
| Console agreement card | `apps/private-console/boxes/preparation/preparation-screen.tsx`, `apps/private-console/boxes/preparation/preparation-client.ts`, optional `apps/private-console/boxes/preparation/preparation-screen.css`; entry in `apps/private-console/src/bootstrap/main.tsx`; bounded additions to `apps/private-console/intake/private-client.ts` for the new Box calls | proposed; keeps the literal `private.localhost:4000` API base and existing fetch/error conventions |
| Auth | `packages/contracts/auth/policy.ts`, `packages/contracts/auth/http.ts` using existing actions `box.read`, `box.write`, `box.behavior.approve`, plus existing intake/intent actions | exists, no new actions |
| Test registration | `tests/box/delegation/preparation.test.ts`, `tests/box/delegation/fixture-registration.test.ts`, `tests/box/delegation/agreement-card.test.ts` | proposed; discovered by `node scripts/suite.mjs box --suite delegation` |
| Delegation test support | `tests/box/delegation/support.ts` | proposed; owns fresh delegation database creation/URL binding, account/session helpers, in-process private API assembly, and fixed browser/loopback launch arguments — it does not reuse the W002 `migratedPool` hostname/cap |
| Fixture registration harness | `tests/box/delegation/fixture-manifest.json`, `tests/box/delegation/register-fixture.mjs` | proposed reviewed wave-local descriptor (`sourceId:"private-shop"`, stage-relative `root:"/stage/examples/private-shop"`, `fixture.snapshotPaths`, complete owner-inventory plan) and fixed-argv script for baseline inventory/digest/commit/registration; the script is reviewed before any execution and cannot accept arbitrary command strings |
| Delegation environment recipe | `tests/box/delegation/environment-manifest.json`, `tests/box/delegation/environment-host.mjs` | proposed reviewed manifest plus a dedicated fixed-argv host orchestrator for only the two named future resources below; it is design input only until the later wave approves it and is not a generic runner framework |

No broad globs, no hidden authorization: if D1.2 needs anything beyond these rows, its brief must say so explicitly.

## Negative and edge requirements

- **Role negatives**: requester calling `POST /v1/boxes/:id/behavior-approval` -> `forbidden_role`; operator calling prepare/revise -> `forbidden_role` because it lacks `box.write`; an executor assigned to the version cannot approve its behavior (store-enforced). Registration is owner/operator-only through the snapshot policy; a requester cannot create the repository registration.
- **Stale version/hash**: revise/readiness with wrong `expectedVersion` -> `stale_version`; wrong `expectedHash` on approval -> `missing_evidence`; an approval bound to version n does not satisfy version n+1. A revised head must show `supersededApproval`.
- **Omitted obligation**: missing acceptance examples, an empty editable surface, unresolved required intent decisions, or a consequential `unknowns` entry leaves the agreement blocked; `POST /v1/boxes/:id/behavior-approval` and `POST /v1/boxes/:id/readiness` cannot turn it open. The card reports the blocking reason instead of hiding it.
- **Restricted fields**: any attempt to embed bounty/payment/disclosure keys is rejected by `assertNoRestrictedFields` with `missing_evidence`.
- **Unsupported coupling**: the unavailable-plan/UI request is rejected during deterministic classification as `unsupported_case`/`preparation_gap`; it must not produce a draft whose editable surface secretly includes protected `src/private/eligibility.ts` or excluded `src/selection/SelectionPanel.tsx`.
- **Idempotency**: prepare (`BoxStore.createPrepared`), approve (`approveBehavior`), and revise (`revisePrepared`) accept operation keys through `box_operation_keys`; replay with identical canonical input returns the recorded result, and replay with different input fails without moving state. `readiness` is naturally idempotent for the same expected version: if the head is already open it returns the current projection, while `open -> open` is not sent to `assertBoxTransition` as a new mutation.
- **Preservation**: registration and preparation do not alter `examples/private-shop`, reference solutions, accepted B1.1 tables, the 12-database W002 resource cap, or existing request/intent route behavior. The owner baseline uses a task-owned isolated directory and is not the recipient package.

## Fixture registration (design, executed in D1.2 — not this wave)

D1.2 creates a real isolated owner Git baseline before registering it. In a task-owned empty directory, it materializes the complete regular-file owner inventory for this fixture except `.git`, `node_modules`, and `dist`: `demo.mjs`, `fixture.json`, `index.html`, `package.json`, `vite.config.ts`, `config/response-security.json`, every regular file under `examples/private-shop/src/`, every regular file under `examples/private-shop/reference-solutions/`, the actual fixture checks `tests/contracts/fixture/private-shop.test.ts` and `tests/contracts/fixture/seed.test.ts`, `research/fixtures/candidates.json` because `private-shop.test.ts` reads it, and owner-only toolchain/test metadata `package.json`, `tsconfig.json`, `scripts/vitest.config.mjs`, `scripts/demo-seed.mjs`, `scripts/process.mjs`. No `examples/private-shop/tests/**` directory exists, so none is invented. The baseline computes `{path, bytes, sha256}` for each file, commits the exact tree locally, and reads the resulting 40-hex commit as `baseCommit`. `private-shop-before-v1` remains only the human label; it is never used where `GitCommitSchema` requires a commit. Reference solutions stay `ownerOnly` in the manifest and are unavailable to the recipient.

The owner registration transaction then stores, in one `POST /v1/box-repositories` operation:

- the owner-side selected-source snapshot in `private_snapshots`/`private_intake_objects`, using `fixture.json` `snapshotPaths` and `importPinnedSnapshot`'s per-file SHA256/snapshot hash. The fixture allowlist includes protected modules for owner registration/provenance; those bytes are not part of the recipient package or explanatory export;
- provenance in `private_snapshot_provenance` (`sourceId`, `sourceRoot`, actor);
- `box_repository_registrations` fields `repoId`, `snapshotId`, `sourceId`, `sourceRoot`, `baseCommit`, `contextManifest`, `contextManifestHash`, `environmentRef`, `evaluatorRef`, `mergeTarget`, `registeredBy`, `registeredAt`.

The `contextManifest` contains the full owner inventory with per-file digests and each file's role (`runnable`, `editable`, `explanatory`, `protected`, `ownerOnly`), the package-to-owner path map, dependency versions, evaluator descriptor, runnable check entrypoints, `plannerExcludedPaths`, and `initialCoupling`. `explanatory` covers only safe non-protected owner files named in SUPPORTED-CASE.md; `protected` records the owner-only status/digest of `src/private/eligibility.ts` and `src/private/scoring.ts` but never exports their raw source to the recipient. Reference solutions are `ownerOnly` and are never exported. The isolated owner baseline is registration truth and comparison support only; a later package must still prove portability from selected source, not from a full clone.

## Supported request bindings and owner UI flow

`supportedCaseId` uses the deterministic labels from SUPPORTED-CASE.md:

| Case | Required binding | Owner result |
| --- | --- | --- |
| `delegation.private-shop.request-a.response-policy` | Request text is the literal header request; `editableSurface` is `config/response-security.json`; context manifest marks safe non-protected `src/server.ts`/`src/selection/api.ts` explanatory and the policy/helper/data files runnable. | Owner sees helper-level HSTS truth (`https && !localhost`) and local-server no-HSTS truth (`localhost: true`) before approving. |
| `delegation.private-shop.request-b.public-ranking` | Request text is the literal ranking request; `editableSurface` is `src/ranking/rankItems.ts`; context manifest marks safe non-protected `rankPrivateItems.ts` and `selection/api.ts` explanatory, not runnable. | Owner sees the new-file patch mapping and the `privateScore`/protected-import exclusion applied to runnable/contribution source, not explanatory prose, before approving. |

`POST /v1/boxes/prepare` returns `{boxId, version:1, state:"draft", contentHash, agreement}` where `agreement` is the projection. `GET /v1/boxes/:id/agreement` returns the same projection for a fresh owner view. `POST /v1/boxes/:id/behavior-approval` returns `{boxId, version, state:"draft", approvedHash}`; `POST /v1/boxes/:id/readiness` takes `{expectedVersion}` and returns `{boxId, version, state:"open"}`; `POST /v1/boxes/:id/revisions` takes `{expectedVersion, artifact, operationKey}` where `artifact` is the next `BehaviorArtifact`, and returns `{boxId, version:n+1, state:"draft", contentHash, approvalInvalidated:true}`.

UI flow: the existing intake screen selects the registered snapshot and accepts either literal request. The existing intents screen resolves decisions and obtains owner intent approval. A new `apps/private-console/boxes/preparation/preparation-screen.tsx` lists the request's prepared Box, renders the agreement card, allows an owner to approve the exact revision or amend into a new version, and calls readiness only after approval. `apps/private-console/src/bootstrap/main.tsx` gains a "Box preparation" tab; `preparation-client.ts` owns the new API calls using the existing `api`/`ApiError` conventions.

## Existing-runtime verification recipe (future execution only)

Exact existing commands proposed for the future D1.2 verification, from `/stage` inside the approved Linux runner — not from the host:

```text
node scripts/suite.mjs box --suite delegation
node scripts/pnpm.mjs test:box-contracts
node scripts/pnpm.mjs test:box-auth
node scripts/pnpm.mjs check
node scripts/pnpm.mjs build
node scripts/pnpm.mjs test:auth
node scripts/pnpm.mjs test:contracts
node scripts/pnpm.mjs test:planner
```

`node scripts/suite.mjs box --suite delegation` resolves to `node node_modules/vitest/vitest.mjs run tests/box/delegation --config scripts/vitest.config.mjs` through `scripts/suite.mjs`; the checked-in config uses `maxWorkers: 1` and `testTimeout: 30000`. Candidate source/tests are not executed on the host. A reviewed host orchestrator sends only fixed argv to the runner and applies the existing durable protection model: `480000` ms per command, SIGTERM, `5000` ms SIGKILL grace, `10000` ms drain/exit confirmation, durable stdout/stderr logs, strict ordered stopping on the first non-pass, and honest `unavailable` for unconfirmed exits or capture failures.

### Proposed isolated owner verification recipe (requires a later explicit approval)

Known cached metadata from `scripts/box-verification/environment-manifest.json` is grounding, **not current readiness**. Before any startup the approved wave must verify image/cache availability, exact image IDs, `/ms-playwright`, Playwright `1.63.0`, Node/pnpm/dependency closure, ownership, source staging digests, and package path mappings. No Docker probe has run for this design.

At most one new internal network and two new containers are proposed:

- network `w004-d12-delegation-net`, created with `docker network create --internal w004-d12-delegation-net`; no host ports or egress;
- Linux runner `w004-d12-delegation-runner`, image `sha256:eb4a84ec3e2948cd47e414fa66054730f10d0c20e5001b895fd58070c81c53f8` (`public-task-toolchain:m4-v1`, cached `/ms-playwright`, Playwright 1.63): user `1000:1000`, read-only root, `cap-drop ALL`, `no-new-privileges`, `2147483648` bytes, `2` CPUs, `256` pids, `/tmp` tmpfs `rw,noexec,nosuid,size=512m`, no ports/egress/daemon socket/credentials;
- Postgres `w004-d12-delegation-db`, image `sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652` (`postgres:17-bookworm`): user `999:999`, `cap-drop ALL`, `no-new-privileges`, `1073741824` bytes, `1` CPU, `128` pids, account-owned tmpfs for `/var/lib/postgresql/data`, `/tmp`, and `/run`, no ports/volumes. Its database is volatile/fresh, owner-scoped and preserved; there is no `DROP`, reset, truncation or automatic cleanup.

Literal fixed-argv shape the reviewed `tests/box/delegation/environment-host.mjs` may emit after the next wave verifies the manifest and source digests:

```text
docker network create --internal w004-d12-delegation-net
docker create --name w004-d12-delegation-db --network w004-d12-delegation-net --network-alias w002-b11-box-db-r4-env2 --user 999:999 --cap-drop ALL --security-opt no-new-privileges --memory 1073741824 --cpus 1 --pids-limit 128 --tmpfs /var/lib/postgresql/data:rw,mode=700,uid=999,gid=999 --tmpfs /tmp:rw,noexec,nosuid,size=128m,uid=999,gid=999 --tmpfs /run:rw,noexec,nosuid,size=64m,uid=999,gid=999 --env POSTGRES_USER=box_fixture --env POSTGRES_DB=postgres --env POSTGRES_PASSWORD=<generated-64-hex> sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652
docker start w004-d12-delegation-db
docker create --name w004-d12-delegation-runner --network w004-d12-delegation-net --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 2147483648 --cpus 2 --pids-limit 256 --tmpfs /tmp:rw,noexec,nosuid,size=512m --mount type=bind,source=C:/Users/shout/AppData/Local/Temp/w004-d12-delegation-stage,target=/stage --mount type=bind,source=C:/Users/shout/AppData/Local/Temp/w004-d12-delegation-deps/node_modules,target=/stage/node_modules,readonly --mount type=bind,source=C:/Users/shout/AppData/Local/Temp/w004-d12-delegation-deps/scripts/tooling/node_modules,target=/stage/scripts/tooling/node_modules,readonly --workdir /stage --env BOX_TEST_DATABASE_URL=postgres://box_fixture:<generated-64-hex>@w002-b11-box-db-r4-env2:5432/postgres --env BOX_TEST_RUN_ID=w004-d12-delegation --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright --entrypoint sleep sha256:eb4a84ec3e2948cd47e414fa66054730f10d0c20e5001b895fd58070c81c53f8 infinity
docker start w004-d12-delegation-runner
```

`<generated-64-hex>` is synthetic `randomBytes(32)` material generated in memory by the reviewed orchestrator and never logged or persisted. `C:/Users/shout/AppData/Local/Temp/w004-d12-delegation-stage` is the task-owned writable staged-candidate root; `C:/Users/shout/AppData/Local/Temp/w004-d12-delegation-deps/node_modules` and `.../scripts/tooling/node_modules` are reviewed staged dependency roots, all declared in the wave-local `environment-manifest.json`. Source staging excludes `.git`, `node_modules`, `.runtime`, `dist`, credentials/remotes and `.env*` other than `.env.example`, and every staged source path carries a current SHA256. The manifest is dedicated to these names/resources and is not a generic runner framework.

Inside the runner, `tests/box/delegation/support.ts` creates one fresh run-prefixed database through the admin URL, migrates it, and starts the real `createPrivateApi` Fastify app in the Vitest process on `127.0.0.1:4000` with stores persisted to that fresh DB. The wave-local manifest independently caps the fresh Postgres at `maxRunPrefixedDatabases:12` with a starting count of zero, matching the existing helper's limit without touching the exhausted W002 count. The test also serves the real private-console UI through the fixed in-runner command `node scripts/pnpm.mjs exec vite apps/private-console --config apps/private-console/vite.config.ts --host 127.0.0.1 --port 3000 --strictPort` and opens it with cached Playwright Chromium only inside that runner. Chromium uses only the fixed resolver argument `--host-resolver-rules=MAP private.localhost 127.0.0.1`; the API remains on `private.localhost:4000` and the console origin on `private.localhost:3000`. No host browser, host service, host port or container-published port is used.

The `w002-b11-box-db-r4-env2` network alias in the literal recipe exists only because `tests/box/auth/support.ts` currently hardcodes that hostname and a 12-database limit in `migratedPool`. Reusing that helper requires a future wave to approve exactly this legacy hostname as a network-local alias on `w004-d12-delegation-net`, mapped to the wholly distinct fresh `w004-d12-delegation-db` resource, and to prove independently that the alias resolves to the new container/resource ID. The old W002 database, DNS, global configuration and exhausted 12/12 state are never used, renewed or reset. If that exact alias permission is not granted, `test:box-auth` remains a declared prerequisite/gap; the safe alternative is a separately reviewed bounded parameterization of the auth fixture pool for `w004-d12-delegation-db`, `w004-d12-delegation-net`, and a fresh independent cap — not editing `tests/box/delegation/support.ts` to spoof it.

Fixed in-runner commands are sent as argv arrays equivalent to `docker exec --workdir /stage w004-d12-delegation-runner node ...`; no arbitrary exec strings are accepted. The command sequence is the eight commands above. The new fixture database is independently capped on the fresh Postgres and preserved after the run; it does not consume, renew or reset the exhausted W002 allowance. No Docker/runtime probe or container/DB/mailbox mutation is authorized by this document.

Coverage: fixture registration creates a real local commit and persistent registration; both literal requests reach draft, owner approval, and open through the same API path; amendment invalidates approval; the unsupported coupling request fails as a preparation gap; role/stale/hash/obligation/restricted/idempotency negatives pass; UI card calls use the same APIs and show stale approval in an actual browser flow. Preservation checks assert source fixture bytes/digests, protected-module nonexport, reference-solution exclusion, accepted B1.1 routes/tables, and no package export or execution.

## Roles and write scope

One sole worker writes the D1.2 candidate paths above; a distinct reviewer verifies the exact candidate. Root CTO owns state/approvals; leads own receipts. Human, agent and hybrid executors share the same obligations; the `executorPolicy.explicitChoiceRequired` contract stays literal-true. This document does not dispatch a worker. Because D1.2 requires new files, the next implementation proposal must first verify a supported new-file tool for the named writer; a terminal `subagent_general` placement through one product lead is only a possible future capability and needs its own explicit placement approval.

## Resolved design choices

- Repository registration gets a dedicated `box_repository_registrations` table; it does not ride the strict snapshot manifest. Add `0013_delegation_preparation.sql`, its Drizzle table, and the index-13 entry in `db/migrations/meta/_journal.json` under the D1.2 shared lease.
- The owner agreement card uses a Box-specific `BoxAgreementProjectionSchema`; it copies the projection discipline of `ReviewProjectionSchema` without reusing its intent-specific shape verbatim.
- Box preparation uses new `/v1/box-repositories` and `/v1/boxes/*` routes. `/v1/intents/:id/preparation` remains the existing planner-preparation seam and is not reused as Box preparation.
- Intent approval is required before Box preparation so `IntentProvenance` points at a reviewed, owner-approved revision. Box behavior approval remains a second, exact-hash approval of the proposed Box version.
- Error mapping uses a new `safeBoxError` modeled on `safeIntentError`. Public errors are `invalid_input`, `unsupported_case`, `not_found`, `forbidden_role`, `stale_version`, `missing_evidence`, `invalid_transition`, and `idempotency_conflict`; internals stay server-side.
- Deterministic `mode:"demo"` intent drafting plus fixture-manifest classification is the required floor. Any model assistance is optional, separately measured, and not claimed in this design.
- The initial structural environment descriptor is generated from checked-in `package.json`, `tsconfig.json`, and `scripts/vitest.config.mjs` toolchain data. `environmentRef` is `{reference:"private-shop-preparation-env", digest:"sha256:<64 lowercase hex>"}` because `reference` uses `IdSchema` and `digest` uses `ImageDigestSchema`. `evaluatorRef` is `{reference:"private-shop-preparation-evaluator", version:1, digest:"<64 lowercase hex>"}` because its contract digest uses `HashSchema`; the canonical evaluator descriptor may display the same digest as `sha256:<64 lowercase hex>`, but the `BoxVersion` field stores the bare hash. These are structural descriptors, not proof of a later execution container/environment identity. No schema relaxation is allowed, and no W002 run-bound environment manifest is reused as a live resource.

## Remaining prerequisites for the D1.2 approval

- Add the migration/schema paths, including `services/private-api/db/migrations/meta/_journal.json`, to the D1.2 write lease before coding.
- Provision the fresh delegation runner/Postgres recipe only under a separately approved runtime wave after cache, image, dependency, ownership and source-mapping checks; the exhausted W002 12/12 database state must not be reused or reset.
- Decide explicitly whether `test:box-auth` uses the narrowly approved `w002-b11-box-db-r4-env2` network-local alias to the fresh W004 DB or waits for a separately reviewed auth-fixture parameterization. Without one of those approvals, auth regression is unavailable rather than silently skipped.
- Register real file digests at implementation time. Digest values in this design are structural requirements, not fresh measurements.
- Confirm the worker has an actual supported new-file tool before product writes. D1.2 necessarily creates modules, tests and a migration; the current D1.1 worker has dedicated `edit` only and cannot create them. A future W004 could place one `subagent_general` worker through one product lead only with separate explicit placement approval and a verified new-file tool gate; root never creates product files or uses shell file writes. If that capability cannot be verified, the next proposal is capability-only and writes no product code — not another unchanged custom-write probe.
- Keep package export, recipient execution, owner verification, integration, comparison, repeat use, payment, and pilot work outside D1.2 until separately approved.

## Boundaries

D1.2 ships preparation/approval of a versioned Box and the owner agreement card. It does not export a package (D2.1), open a recipient workspace (D2.2), verify/merge contributions (D3.x), run the comparison (D4.x), publish bounties, recruit participants, or claim full-clone portability — the recipient case is proven later with exported selected source plus declared dependencies, not the owner's repository. One plain CEO decision approves D1.2; runtime implementation and any pilot remain pending until then.
