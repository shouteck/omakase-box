# K2b: run the service-dependent suites against host-run APIs

Milestone: K2 · Station: service-data · Base: master after K2a · Branch: `wave/K2b` · Timebox: 5 hours

## Outcome

`tests/auth/persistence/auth-live.test.ts`, `tests/planner/evidence/intake-live.test.ts` and the `tests/e2e/intent/` suite run against `private-api` and `external-api` started on the host by the test harness, backed by the disposable Postgres. `node scripts/verify.mjs` (full check included) exits 0 with no Docker, and the `auth-live` HTTP 429 flake is gone because each run gets fresh service processes. This is the last wave that uses the synthetic container stack; afterwards nothing in ordinary verification needs Docker.

## Scope

- Write:
  - The smallest host-run mode for the two APIs. Today `services/{private,external}-api/src/bootstrap/environment.ts` hard-requires container literals (`PRIVATE_DATABASE_HOST === 'db-private'`, `*_FILE` paths matching `^/run/secrets/`, `PRIVATE_STORAGE_ROOT === '/data/private'`). Add a narrowly-scoped host test mode (suggest `SYNTHETIC_HOST_TEST === 'true'` or extend validation to accept loopback hosts and absolute host paths) so the real bootstrap runs on the host. Do not loosen the production/container path's validation.
  - `services/private-api/src/bootstrap/main.ts`: the `SYNTHETIC_SNAPSHOT_SOURCE` gate reads a hardcoded `/workspace/examples/private-shop/fixture.json` (line ~61) — accept a path from env in host test mode so `verify-intake.mjs`'s `synthetic-shop` source resolves. Same for the `COMMAND_ENDPOINT`/`EXPORT_ENDPOINT`/`FEEDBACK_ENDPOINT` literals if the tests need them (they may not — check).
  - `scripts/verify-auth.mjs`, `scripts/verify-intake.mjs`: point HTTP calls at the host-run services (same Host/Origin headers, `127.0.0.1:4000/4001`), replace docker-exec fixture calls with the host fixture mechanism from K2a, and keep every assertion key identical.
  - The harness additions to start/stop the two services per run (extend the helper K2a created): build `dist/main.js` via the existing workspace build or spawn the vite SSR output; wait on `/health`; kill on teardown.
  - `tests/e2e/intent/support.ts`: `ensureRuntime`/`seedAccounts`/`fixtureAction`/`externalSeed` move to the host harness and host fixture mechanism; delete the 429 `docker compose restart` workarounds in `signIn` and `consoleSignIn` (fresh processes make them unnecessary). The console build/serve/Playwright parts stay.
- Read for context: K2a's merged helper, `services/private-api/src/bootstrap/{main,server,environment}.ts`, `scripts/demo.mjs`, `packages/contracts/auth/http.ts` (the rate limit).
- Do not touch: production auth/rate-limit logic, session/CSRF handling, other services' source beyond the two bootstrap seams, `.execution/**`, `tests/box/**`, `scripts/box-verification/**`.

## Done when

- `node scripts/verify.mjs test:auth test:planner test:e2e` exits 0 on the final commit with no synthetic containers, and a full `node scripts/verify.mjs test:contracts test:auth test:planner` passes twice in a row (the second run proves the 429 flake is gone — each run is fresh processes on fresh databases).
- Both tests assert the same JSON keys as on master; the Playwright browser flow still runs for real (chromium from `.runtime/browsers`, shell servers on 3000/3001).
- Ports 4000/4001/3000/3001 are released when the suite ends; no service process or database survives a run, including a failed run.
- Host test mode cannot be activated accidentally in the container deployment: the new env gate is explicit and the container compose file does not set it.

## Review lenses

- [x] **Security:** this wave adds a new bootstrap mode to two services. The reviewer checks it cannot weaken container-mode validation, accepts only loopback database hosts, never relaxes Host-header/Origin/CSRF/rate-limit checks, and that secrets stay in 0o600 temp files outside the repo.
- [ ] **User experience:** not applicable.
- [ ] **Measurement fairness:** not applicable.
- [ ] **Second model family:** not required.

## Notes for the worker

- The rate limit (20 logins / 5 min / IP) lives in `packages/contracts/auth/http.ts`; per-run fresh processes reset it, so back-to-back runs pass. Do not raise the limit.
- Host binding: without `TRUSTED_CONTAINER_LISTEN` the services bind `127.0.0.1` — that is what we want; do not set it.
- Playwright resolution uses `--host-resolver-rules` in the verify scripts already; no `/etc/hosts` changes.
- `embedded-postgres` gives one server per verify run; both services share it via separate databases (`private_task`, `external_task`) — that matches what K2a establishes.
- Known on this host: `127.0.0.1:4000` can be held by Docker Desktop's backend. Bind the test services to free loopback ports/addresses (D1.2 used 127.0.0.2) and keep the `Host: private.localhost:4000`-style headers — the Host/Origin headers are the contract, not the bound port.
- TypeScript test files importing a `.mjs` helper need a `.d.mts` companion — see `scripts/host-test-runtime.d.mts` from K2a.
- When the host APIs run per-suite instead of persistently, `tests/e2e/intent/support.ts`'s `ensureRuntime` can start them once per vitest run in a global setup or a beforeAll; keep the pattern simple.
- If loosening the env schema turns out to need a bigger refactor than a scoped host-test mode, stop and report the shape you found rather than rewriting the bootstrap.

---

## Result

- Worker: · Reviewer: pass (independent; did not write the code)
- Commit: 7583c0825ad4f2ce3307986314dad4d52bd1a3d0
- Verify: `verify 7583c08 PASS check=0 build=0 test:auth=0 test:planner=0 test:e2e=0 db=embedded 253s` — run by the reviewer on the candidate, and a second consecutive identical PASS (251s); auth-live/intake-live each ran 4 times across both runs with no 429.
- Verdict: PASS (test-verified)
- Lenses:
  - **Security:** attacked `SYNTHETIC_HOST_TEST` directly against the real parsers. Non-loopback DB hosts (10.0.0.9, 0.0.0.0, 192.168.1.5, localhost.evil.com, decimal 2130706433) all rejected; only 127.x/localhost/::1/[::1] accepted. File paths confined under the OS temp dir — `..` traversal, temp-sibling prefix dirs and repo paths all rejected. `TRUSTED_CONTAINER_LISTEN` + the gate throws ('cannot publish beyond loopback'); `SYNTHETIC_HOST_TEST_BIND` is validated to 127.x and ignored without the gate; `SYNTHETIC_HOST_TEST='1'` or absent falls to the untouched container schema (strict literals), so container mode is unchanged and the compose file never sets the gate. Host/Origin/CSRF/session/rate-limit code untouched (no diff in server.ts, cookie-policy, packages/); secrets are per-run 0o600 files under a mkdtemp dir. TCP mirrors bind only ::1/127.0.0.1, forward only to the loopback target, and are socket-tracked + closed in cleanup; they die with the harness process and service children carry a stdin-watchdog for killed runs.
- Method: read the full `git diff master...7583c08`; ran `node scripts/verify.mjs test:auth test:planner test:e2e` twice in the foreground on the exact SHA (both PASS); exercised `parsePrivateEnvironment`/`parseExternalEnvironment` with 19 hostile inputs beyond the added vitest cases; diffed asserted JSON keys and assert lines vs master (identical — only the docker-exit-code asserts moved into `runFixture` throwing on non-zero); post-run residue sweep.
- Findings and limits: no leftovers — only Docker Desktop's backend (PID 98996, disclosed) holds 127.0.0.1:4000/4001; no mirror/service/postgres listeners, no `k2a-host-runtime-*`/`ptm-host-*`/`kitchen-verify-pg-*` temp dirs, no `host-*.mjs` bundles, databases dropped with the embedded server. Minor: mirror bind failure is silent (a held loopback port just skips that mirror — failure direction is a test error, not exposure); unknown env keys are ignored by the selector, matching master's behaviour. `tests/e2e/intent/scripts.d.ts` deletion is safe — no remaining docker.mjs/synthetic-runtime.mjs imports and `tsc --noEmit` passes in check. Host: Windows/Cursor agent; model: Claude.
- Merged: · Resources removed: none required — per-run processes, mirrors, temp dirs and databases self-cleaned.
