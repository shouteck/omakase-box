# K29 inventory notes (worker working file)

Dispatch base / HEAD: `d418ee32b073357c3859f77482d322e87ba7b0f7` on `wave/K29`.
Archive `archive/box-platform-2026-10` verified on origin at the same SHA (created and pushed by the CTO; not recreated).

## Who-uses-it scan

Kept areas searched for each removal name: `packages/box-bounty`, `packages/box-cli/src`, `packages/box-cli/pack.mjs`, `tests/box/bounty`, `tests/kitchen`, `scripts/`, `.github/`, `kitchen/demo/`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `README.md`.

| Path | What it is | Who in the kept tree uses it | Verdict |
|---|---|---|---|
| `services/` (external-api, private-api, runner-controller) | older platform services | `scripts/workspace.mjs` build, `scripts/boundaries.mjs` walk, `scripts/suite.mjs` check map, removed scripts, tsconfig, pnpm-workspace | remove |
| `apps/` (contributor-portal, private-console) | older platform web apps | same as above | remove |
| `packages/` analyzer, box-contracts, box-package, box-trace, compiler, contracts, evaluation, planner, runner-protocol | older platform packages | `packages/box-cli/src/cli.ts` lazy-imports box-package/box-trace for the removed commands; otherwise only removed tests, suite map, boundaries, standalone.test.ts's *forbidden-name* guard (kept; the guard must keep working on an empty tree) | remove |
| `packages/box-bounty`, `packages/box-cli` (minus removed subcommands) | the product | everything | keep |
| `examples/` | fixture apps | `scripts/workspace.mjs`, `smoke-private-shop.mjs`, removed tests only | remove |
| `infra/` | compose + runner docker | `execution.mjs`, `host-test-runtime.mjs`, `verify-evaluation-pipeline.mjs` (all removed) | remove |
| `tests/` acceptance, analysis, auth, bootstrap, compiler, containers, contracts, e2e, planner, portal, runner, security | older platform suites | named only by removed suites/package.json scripts | remove |
| `tests/box/` auth, contracts, delegation, package, trace | older Box command suites | `tests/kitchen/k6-corrections.test.ts` uses `tests/box/package/pnpm-shim.mjs` as a fixture; `k6-scope-budget` names `tests/box/package/export.test.ts` as a refused out-of-suite path; `verify-reuse` names several removed paths/suites as fixture labels | remove (kitchen tests updated, see Result) |
| `tests/box/bounty`, `tests/kitchen` | product + kitchen suites | — | keep |
| `research/box-delegation`, `research/fixtures`, `tasks/` | older platform research/task graphs | `research/fixtures/candidates.json` read only by removed `tests/contracts/fixture/private-shop.test.ts` | remove |
| `docs/` ARCHITECTURE, COMPOSITION, DECISIONS, EVALUATION, SECURITY, SOURCES, SPEC, assurance-model, demo-fixtures, model-configuration, runner-setup, runtime, tooling, docs/research | older platform docs | nothing kept links them | remove |
| `docs/box-v4/` except BOUNTY.md, BOUNTY-FORMAT.md, KITCHEN.md, OVERNIGHT.md, PSTACK.md, **LESSONS-W002.md** | older platform docs | KITCHEN.md links `LESSONS-W002.md`, so it stays; the five brief-named files stay | remove the rest (ARCHITECTURE, BOX-TRACE, DECISIONS, DELEGATION-MAP, MEMORY-SPEC, PACKET, RESEARCH, REUSE, SOURCES, SPEC, delegation/, profile-contract.md, reconciliation/) |
| `docs/legacy/` | frozen history | — | untouched (rule 8) |
| `box` export/submit/verify/trace subcommands | older platform CLI | `cli.ts` branches + help lines; `box.ts` refusal wording | remove commands; keep named `command-removed` refusal |
| `scripts/` verify-*.mjs (acceptance, auth, empty-migrations, evaluation-pipeline, intake, intent-sessions, lifecycles, mvp, persistence, readiness), smoke-bootstrap, smoke-private-shop, demo.mjs, demo-seed.mjs, doctor, check-startup, audit-execution, execution, evidence, docker, host-test-runtime.*, boundaries, vite-safety.ts | older platform tooling | only removed suites/scripts; `docker.mjs` used only by verify's `--db=docker`; `boundaries.mjs` only walks removed services/apps/contracts | remove |
| `scripts/` verify.mjs, suite.mjs, pnpm.mjs, workspace.mjs, kitchen-stats.mjs, process.mjs, toolchain.json, tooling/, vitest.config.mjs | kitchen tooling | everything | keep (verify/suite/workspace slimmed) |
| devDeps: `drizzle-kit`, `embedded-postgres`, `@types/react`, `@types/react-dom`, `yaml` | older platform deps | only removed code | remove |
| devDeps: `@playwright/test` | browser driver | **kept** — `kitchen/demo/record.mjs` (K16) drives Playwright | keep |
| devDeps: `vite`, `typescript`, `vitest`, `@types/node` | build/test toolchain | workspace.mjs, pack.mjs, suite.mjs, tsc | keep |
| `pnpm-workspace.yaml` apps/*, services/*, examples/* globs; embedded-postgres allowBuilds | workspace wiring | — | remove |
| `tsconfig.json` react types, apps/services/examples includes | TS config | — | slim to node types + packages/tests includes |

## Unclear / listed for the head chef

- `kitchen/demo/runs/` — recorded demo runs under kitchen/; outside the worker's write paths, listed for the CTO.
- `tests/box/bounty/bt23-real-records.fixture.txt` names `docs/box-v4/delegation/FIRST-IMPLEMENTATION-BRIEF.md` inside stored record text — fixture data, not a filesystem read; the doc still goes.
- `tests/box/bounty/bt14.test.ts` `box --help` ordering test asserts `box export` is listed after `box bounty create`; the removed help line forces an expectation change (documented in Result).
- Untracked, empty `kitchenmemorystorage/` and `packagesbox-clisrc/` directories exist in the worktree (path-artifact litter from an earlier tool); not created by this wave and not touched.

## Embedded Postgres

After the removal no named suite reads `BOX_TEST_DATABASE_URL`/`BOX_DELEGATION_DATABASE_URL` and no `check` suite exists that reached `acquireHostRuntime`; `verify` therefore no longer provisions a database and the `--db` modes, docker.mjs and the `embedded-postgres` dependency go with it (`db=none` in summaries).

## Late findings (during verification)

- `tests/box/bounty/bt8b.test.ts` ("the tool scanner finds no secret-shaped literal in the added candidate diff") spawns `git diff master...HEAD` with spawnSync's default 1 MB `maxBuffer`. This wave's diff is far larger, so `result.status` was `null` (ENOBUFS) — the run on `8c4196d` failed only here. Fix: `maxBuffer: 64 * 1024 * 1024` on that one spawn; the scanned content and the assertion are unchanged. Protected-file change driven by wave size, not by removed code.
- BT17 re-measure (`tests/box/bounty/bt17-measure.mjs`, candidate dist at `5a9f752`): every `box bounty` step byte-identical to the baseline taken at `d418ee3`; the single differing step is `box --help` (1181→707 characters, 14→10 lines), which is exactly the removed `export`/`submit`/`verify`/`trace` help lines.
- Negative checks on the final dist: `box export`, `box submit`, `box verify`, `box trace` each print `<cmd>: command-removed — this command belonged to the older Box platform, retired on 18 October 2026; box bounty is the product`.
- Lockfile: `node scripts/pnpm.mjs install` reported "Lockfile is up to date"; the regeneration happened inside chunk 3 (86 packages dropped from the lockfile, none added).
