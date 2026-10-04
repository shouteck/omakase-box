# B0.2 — shared integration-path inventory for the next brief (W002)

Wave W001, approved by the CEO (verbatim message "Approve") at 2026-10-04T07:11:18Z against brief `.execution/box-v4/briefings/W001.md` revision 2026-10-04-r4, digest sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1. Approval record: `.execution/box-v4/approvals/W001-approval.json`. Scope: B0.2 only; docs/evidence writes only; no product code.

Compiled 2026-10-04 under `devin_portable_pstack_adaptation`, base commit `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c`. Every entry was verified by reading the actual file; "observed" = bytes read this session. Owner task IDs come from `tasks/box-v4-task-graph.json` `writePaths`. "Lease" means the CTO-managed shared integration lease required by PROTOCOL.md for shared schemas/migrations/tooling — the lease scope name is given per row. New-tree paths that appear in exactly one task's writePaths are exclusive-owned and need no lease.

## 1. Tooling / suite registration

Observed conventions:

- Commands run as `node scripts/pnpm.mjs <args>`; the wrapper spawns the repo-local pnpm (`scripts/tooling/node_modules/pnpm/bin/pnpm.cjs`) and maps a package.json script name to `pnpm run` (`scripts/pnpm.mjs:13`).
- `scripts/suite.mjs` resolves `tests/<suite>/<subgroup>` and runs vitest; `--real` or a missing suite dir returns `{status:'unavailable'}` exit 2 — honest-unavailable, never a silent pass.
- `scripts/workspace.mjs check` runs tsc `--noEmit` + `scripts/boundaries.mjs` then the fixed suite list `['bootstrap','auth','contracts','planner']`.

| Path | What lands there | Owning task | Lease | Revalidation on change |
|---|---|---|---|---|
| `package.json` `scripts` block | New `test:box-*` script entries. B1.1 names `test:box-contracts` and `test:box-auth` (B1.1 deliverable: "through a coordinator tooling lease"). Natural mapping observed: `"test:box-contracts": "node scripts/suite.mjs box --suite contracts"` → `tests/box/contracts` via suite.mjs's `--suite` subgroup arg. Later tasks add `test:box-git` (B1.2), `test:box-intents` (B2.1), `test:box-behavior` (B2.2), `test:box-workspaces` (B3.1), `test:box-evaluation` (B3.2), `test:box-api` (B4.1), `test:box-web` (B4.2) and more. | B1.1 first (W002); later tasks append | `lease:tooling-scripts` (package.json is in NO task's writePaths — every edit needs the lease named in the wave brief) | Whatever the new command names: the owning task's tests plus `node scripts/pnpm.mjs check` (tsc over all `tests/**/*.ts` — tsconfig include covers tests/) |
| `scripts/suite.mjs` | None expected — `--suite` already covers `tests/box/<subgroup>`. Edit only if box suites need different flags (e.g. per-suite `--real` semantics for B3.1's `test:box-workspaces --real`, which suite.mjs currently hard-fails as unavailable). | B3.1 if touched | `lease:tooling-scripts` | All `test:*` commands that route through it |
| `scripts/workspace.mjs` | `check` mode's hardcoded suite list; whether box suites join `check` is a W002-scope decision. Build mode's fixed service/app arrays do not cover new `services/private-api/boxes/**` (it builds service roots, not subtrees — no change needed). | Any task that extends `check` coverage | `lease:tooling-scripts` | `node scripts/pnpm.mjs check` and `node scripts/pnpm.mjs build` |
| `scripts/pnpm.mjs` | None — wrapper is generic; convention is `node scripts/pnpm.mjs <script>`. | none | n/a | n/a |
| `scripts/boundaries.mjs` | POSSIBLE REQUIRED EDIT — observed seam gap: `checkExternalBoundaries` walks only `services/external-api`, `apps/contributor-portal`, `packages/contracts/public`, and its forbidden-prefix list does not include `packages/box-*/`. External-side code could import `packages/box-contracts/**` unchecked today. Either (a) add `packages/box-*/` to forbidden prefixes, or (b) keep box contracts under `packages/contracts/` — the W002 brief must pick one. | B1.1 or B4.1 depending on choice | `lease:tooling-scripts` | `node scripts/pnpm.mjs check` (boundaries step runs inside check) |
| `pnpm-workspace.yaml` / `tsconfig.json` | None — globs `packages/*`, `services/*`, `apps/*`, `examples/*` and tsconfig `include` already cover every named `packages/box-*/`, `services/private-api/boxes/**`, `tests/box/**`, `apps/private-console/boxes/**` path. Each new package needs its own `package.json` (`@private-task/<name>` convention, observed `packages/contracts/package.json`). | none | n/a | n/a |

## 2. Service / app bootstrap

Observed registration pattern (`services/private-api/src/bootstrap/server.ts`): `createPrivateApi(auth)` builds the Fastify app, installs the host/origin guard hook, calls `installPrivateAuth(app, auth.store, auth.mode, auth.resources)` which returns `handlers`, then conditionally calls one `install*Routes(app, handlers, <store>)` per domain driven by which `auth.*` store fields are present. `main.ts` constructs the real `Pool` + stores and fills the `auth` object literal (line 79). Console nav: `apps/private-console/src/bootstrap/main.tsx` holds a tab union type + `<nav>` buttons + screen render block.

| Path | What lands there | Owning task | Lease | Revalidation on change |
|---|---|---|---|---|
| `services/private-api/src/bootstrap/server.ts` | `auth` options type gains box store fields (e.g. `boxes?: ...`); `installBoxRoutes(app, handlers, auth.boxes)` registration line(s). File is in NO writePaths (B4.1 lists it only under `reuse`) — shared. | B4.1 (platform_execution) | `lease:private-api-bootstrap` | All private-api route users: `test:box-api`, existing `test:auth`, `test:bootstrap`, `check`, plus session/CSRF behavior on every protected route |
| `services/private-api/src/bootstrap/main.ts` | Real `Pool`-backed Box stores constructed and added to the `auth` object literal; any timers follow the existing `setInterval`/`unref`/`onClose` cleanup pattern. Shared, same lease family. | B4.1 | `lease:private-api-bootstrap` | `node scripts/pnpm.mjs build` (vite ssr of `src/bootstrap/main.ts`); live boot check in whatever environment the wave approves |
| `apps/private-console/src/bootstrap/main.tsx` | Nav button + tab union member + screen wiring for Box Web. | B4.2 — file IS in B4.2 writePaths, so it is exclusive to that task | none needed (exclusive writePath); other tasks must not touch it | `test:box-web`, console build via `node scripts/pnpm.mjs build` |

## 3. DB schema and auth wiring

Observed: drizzle-orm/node-postgres; `services/private-api/db/migrations/` holds `0000`–`0011` SQL files + `meta/_journal.json` (entries idx 0–11, `version:"7"`, `dialect:"postgresql"`) + `meta/` snapshots ONLY for 0000 and 0001 (later migrations are hand-authored SQL with journal rows but no snapshot file). `db/migrate.ts` runs `migrate(drizzle(pool), {migrationsFolder})`. Table objects are declared in `services/private-api/db/schema.ts` for typed queries. Roles: `private_role` enum `['requester','owner','operator']`; `AuthAction` union in `packages/contracts/auth/policy.ts`; session+CSRF enforced in `packages/contracts/auth/store.ts` (`authenticateMutation` requires 64-hex CSRF) and `authHandlers` guard hook.

| Path | What lands there | Owning task | Lease | Revalidation on change |
|---|---|---|---|---|
| `services/private-api/db/migrations/**` | Next migration `0012_<tag>.sql` (append-only; numbering confirmed against journal idx 11) + a new `_journal.json` entry (`idx:12`, `version:"7"`, `when`, `tag`, `breakpoints`). Snapshot-file convention is partial (only 0000/0001 have `NNNN_snapshot.json`) — the W002 brief should state whether B1.1 emits a snapshot file or follows the 0002–0011 no-snapshot convention. | B1.1 — in writePaths (exclusive append scope, but `_journal.json` is a shared single file → serialize via lease) | `lease:private-db-migrations` (one writer appends at a time; two migrations in one wave must not both claim idx 12) | `db/migrate.ts` against the synthetic private DB; `test:box-auth`, `test:box-contracts` migration checks; existing stores must still migrate (integrity triggers in 0002/0003 must not be weakened) |
| `services/private-api/db/schema.ts` | POSSIBLE — drizzle table objects for new box tables if stores query through schema.ts. Alternative observed-compatible: declare table objects inside `services/private-api/boxes/store/**` (B1.1 writePath) and leave schema.ts untouched — avoids a shared write entirely. W002 brief must pick and name it. | B1.1 if touched | `lease:private-api-db-schema` | tsc `--noEmit` over all stores that import schema.ts; `check` |
| `packages/contracts/auth/policy.ts` | New `AuthAction` members for box operations (e.g. `box.read`, `box.write`, `box.approve`, `box.merge.approve` — exact names are B1.1/B4.1 design). File is in NO writePaths (B1.1 lists `packages/contracts/auth/**` under reuse only) — shared. | B1.1 (server-side permission definitions are a B1.1 deliverable) | `lease:auth-contracts` | `test:auth`, `test:box-auth`, every `requirePermission` call site, external boundary check (policy.ts is private-side; keep it out of `contracts/public`) |
| `packages/contracts/auth/store.ts`, `http.ts`, `crypto.ts`; `services/private-api/auth/**` | None expected — session/CSRF/invitation machinery is reused as-is via `handlers` (observed: `requirePermission`, `authenticateMutation`, guard hook). New box routes consume `handlers` like existing `install*Routes`. | none (reuse only) | n/a | If ever touched: all auth/session tests + every protected route |

## 4. Exclusive new-tree paths (no lease — single-task writePaths)

These appear in exactly one task's `writePaths`; the owning worker writes them under its own candidate without a shared lease:

- B1.1: `packages/box-contracts/**`, `services/private-api/boxes/store/**`, `tests/box/contracts/**`, `tests/box/auth/**` (plus `services/private-api/db/migrations/**` under the migration lease for `_journal.json`).
- B1.2: `packages/box-git/**`, `services/private-api/boxes/repositories/**`, `services/private-api/boxes/attempts/**`, `scripts/box-git/**`, `examples/box-demo/**`, `tests/box/git/**`.
- B2.1: `services/private-api/boxes/intents/**`, `packages/planner/box-intents/**`, `apps/private-console/boxes/intake/**`, `tests/box/intents/**`.
- B2.2: `apps/private-console/boxes/behavior/**`, `services/private-api/boxes/behavior/**`, `packages/box-contracts/behavior/**`, `tests/box/behavior/**`.
- B3.1: `packages/box-workspace/**`, `infra/box-workspaces/**`, `services/private-api/boxes/workspaces/**`, `tests/box/workspaces/**`, `docs/box-v4/workspace-operations.md`.
- B3.2: `packages/box-evaluation/**`, `services/private-api/boxes/evaluations/**`, `tests/box/evaluation/**`, `tests/box/fixtures/**`.
- B4.1: `services/private-api/boxes/routes/**`, `services/private-api/boxes/api/**`, `packages/box-contracts/api/**`, `tests/box/api/**`.
- B4.2: `apps/private-console/boxes/web/**`, `apps/private-console/src/bootstrap/main.tsx`, `tests/box/web/**`.
- B5.1/B5.2/B6.1/B6.2/B7.1/B7.2/B8.1/B8.2 writePaths are all single-owner trees; the only recurring shared seams across later tasks are `packages/box-contracts/**` subtrees (split by subdirectory across B1.1/B2.2/B4.1/B6.1 — disjoint subdirs, same package root; a manifest or index.ts at `packages/box-contracts/` root WOULD be shared and needs lease treatment if added) and `packages/box-git/{,drift,merge}/**` (B1.2 creates the package root; B7.1/B7.2 append subdirs — the package.json at root is B1.2-owned, later tasks must not rewrite it).

## 5. Summary for the W002 brief

Minimum shared paths the next brief must name explicitly (with worker owner + lease + revalidation):

1. `package.json` scripts — B1.1 registers `test:box-contracts`, `test:box-auth`; lease `tooling-scripts`; revalidate: the new commands + `check`.
2. `services/private-api/db/migrations/meta/_journal.json` (+ `0012_*.sql`) — B1.1; lease `private-db-migrations`; revalidate: migrate against synthetic DB.
3. `packages/contracts/auth/policy.ts` — B1.1 box AuthAction extension; lease `auth-contracts`; revalidate: `test:auth` + `test:box-auth`.
4. `scripts/boundaries.mjs` — box-contracts private-boundary decision; lease `tooling-scripts`; revalidate: `check`.
5. `services/private-api/db/schema.ts` — only if B1.1 registers tables there instead of colocating; lease `private-api-db-schema`.
6. `services/private-api/src/bootstrap/{server.ts,main.ts}` — deferred to B4.1's wave; lease `private-api-bootstrap`; revalidate: all route tests.

Everything else in B1.1's writePaths is exclusive new-tree scope.
