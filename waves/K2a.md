# K2a: run the DB-only legacy live tests on the disposable Postgres

Milestone: K2 · Station: service-data · Base: current master · Branch: `wave/K2a` · Timebox: 5 hours

## Outcome

Fourteen of the sixteen `*-live.test.ts` tests run on the host against the disposable Postgres `scripts/verify.mjs` provides (`BOX_TEST_DATABASE_URL`), with no Docker. `node scripts/verify.mjs test:auth test:contracts test:acceptance test:compiler test:portal test:runner test:security` exits 0 with the four `private-task-mvp-synthetic` containers stopped. The two tests that need live HTTP services and a browser (`tests/auth/persistence/auth-live.test.ts`, `tests/planner/evidence/intake-live.test.ts`) are NOT in this wave; K2b handles them.

## Scope

- Write:
  - A host test-runtime helper (new file, e.g. `scripts/host-test-runtime.mjs` or `tests/support/host-db.ts` — worker's choice, one place) that: builds `private_task` and `external_task` databases on the `BOX_TEST_DATABASE_URL` server, runs `services/{private,external}-api/db/migrations/` on each, seeds the `synthetic.bootstrap.owner` owner row, hands children the `PRIVATE_/EXTERNAL_DATABASE_*` env and per-run secret files (generate keys/passwords per run, temp dir under OS temp, removed after), and drops the created databases on teardown.
  - `scripts/verify-empty-migrations.mjs`, `verify-acceptance.mjs`, `verify-evaluation-pipeline.mjs`, `verify-readiness.mjs`, `verify-lifecycles.mjs`, `verify-persistence.mjs`, `verify-intent-sessions.mjs`: replace `docker([...composeArguments, 'exec', ...])` with local `spawn(process.execPath, ...)` carrying the host env. Keep their assertion JSON unchanged.
  - The six bundled-fixture tests `tests/portal/{publication/durable,reservations/*}-live.test.ts`, `tests/runner/lifecycle/store-live.test.ts`, `tests/security/patch-and-budget/intake-live.test.ts`: replace `docker compose exec -T ... node --input-type=module` with a local spawn using `cwd: services/<svc>` and the host env.
  - `tests/compiler/approval/persistence-live.test.ts`: rewrite it — today it executes the frozen file `.execution/evidence/M4.1/verify-release-live.mjs`, which may not be referenced. Call `runReleaseFixture` from `services/private-api/releases/live-fixture.ts` directly with the same bundling mechanism as the other fixture tests.
  - `package.json` only if a script entry is needed.
- Read for context: `tests/box/auth/support.ts` (`migratedPool` — the pattern for URL validation and per-run databases), `scripts/synthetic-runtime.mjs` (the env/secret map), `services/*/src/bootstrap/environment.ts`, the live-fixture modules under `services/*/`.
- Do not touch: `tests/box/**` except nothing, `services/**` source (K2b owns bootstrap changes), `tests/auth/persistence/auth-live.test.ts`, `tests/planner/evidence/intake-live.test.ts`, `infra/compose.yaml`, `scripts/box-verification/**`, `tests/box/verification/**`, `.execution/**`. Do not weaken or rename any assertion.

## Done when

- The verify command above exits 0 on the final commit with Docker Desktop stopped or the synthetic containers absent. State in the report how Docker absence was ensured.
- Every ported test still asserts the same things it asserted against the containers (diff the asserted JSON keys in the report).
- The compiler test no longer references `.execution/`.
- Nothing is left behind: no databases besides the disposable server itself, no temp dirs, no processes. Fixtures that create `synthetic_*` databases must be dropped by the harness after each test even though the server is disposable.
- `auth-live` and `intake-live` still exist and are still excluded the same way they are today (they run only inside their suites' directories; if the ported harness would run them without Docker they may be temporarily marked to report 'unverified, pending K2b' — but only if they cannot pass; do not weaken their assertions).

## Review lenses

- [x] **Security:** the harness generates real key material and DB credentials on the host. The reviewer checks the loopback-only database URL validation (pg parser trap — never hand the URL string to `pg`), secret-file permissions, and that no secret lands in logs or committed files.
- [ ] **User experience:** not applicable (no person-facing surface).
- [ ] **Measurement fairness:** not applicable.
- [ ] **Second model family:** not required.

## Notes for the worker

- `pg`'s URL parser accepts `?host=` overrides that bypass loopback checks — validate the URL, then build pools from explicit fields (see `tests/box/auth/support.ts`).
- `BOX_TEST_DATABASE_URL` points at the disposable server's `postgres` database; use it as the admin connection, then `CREATE DATABASE private_task` / `external_task`. Two fixtures assert `PRIVATE_DATABASE_NAME === 'private_task'` literally (`jobs/live-fixture.ts`, `releases/live-fixture.ts`) — keep those database names.
- Fixture command files (`dist/fixture.js` style entries) are not built on the host; the equivalent on host is running the fixture entry source through the same vite-bundle mechanism the Pattern-B tests already use, or building the extra dist entries — pick whichever is smaller.
- `verify-persistence` needs the seeded owner; `verify-empty-migrations` creates `synthetic_empty_*` databases — both are covered by the harness.
- `migrate` calls in fixtures use `migrationsFolder: 'db/migrations'` relative to cwd: spawn with `cwd` set to the service directory.
- The 429 flake disappears for ported tests (no shared container rate limiter); the two deferred tests keep today's behaviour.
- If a ported test cannot be made to pass without weakening an assertion, stop and report which and why.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
