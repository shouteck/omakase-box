# W002 / B1.1 — independent reviewer verdict r2 (corrected candidate, retry 1): `not_accepted`

Reviewer `77c88b35`, distinct from sole worker `e44008a7`. I implemented nothing and repaired no candidate byte. All hashes recomputed by me on the current working tree and cmp-verified against the staged mount `C:/Users/shout/AppData/Local/Temp/w002-b11-stage` (16/16 files SAME).

## Authority (re-verified)

- Brief `.execution/box-v4/briefings/W002.md` r1 recomputed `sha256:44e984be1e01abfed357945f196f16738e30c43de1e5bb0e2adcdc891d5a7ac9` — matches approval and wave.
- Approval `Approve` observed `2026-10-04T08:35:06.1650860Z`, bound digest identical, base `cd3feaf0c467df6c4b9734974722f8471f0da891` (master).
- `waves/W002.json` (sha256 `c485b959…f571`): status `approved`, `holdEvents: []`, `revocationEvents: []`.
- `approvals/W002-approval.json` sha256 `5114753a…c5a9`; `state.json` sha256 `de0b4db6…e933` — B1.1 `ready`, not accepted; consistent.

## Corrections independently verified

1. `scripts/vitest.config.mjs` — now `sha256:0af03a7f…c208`, byte-identical to the base blob (`git show HEAD:` same digest); no longer a candidate change. Prior out-of-scope write fully reverted. VERIFIED.
2. `meta/_journal.json` — `sha256:d46dc1f0…fa9a`; `git diff` vs base shows an insertion-only hunk appending idx 12 (`0012_open_box_foundation`); entries 0–11 byte-preserved. VERIFIED.
3. `candidate-manifest.json` — exists, valid JSON, `workerDispatchId: e44008a7`, `retry: 1`, brief/base/approval bound; every one of its 16 candidate hashes matches my recomputation exactly; evidence-file hashes accurate for all listed files (it cannot hash itself; it omits `worker-receipt-r2.md`, which postdates it — acceptable, noted). VERIFIED.
4. No product-code changes vs r1 — all product/test hashes identical to r1 manifest values. VERIFIED.

## Scope audit

Current modified/untracked product files = approved exclusive paths + named leases only. No hidden changes: `git status` shows no other product writes; `services/private-api/db/schema.ts`, `pnpm-lock.yaml`, bootstrap/server/main, suite.mjs/workspace.mjs unchanged. Staging dir contains disclosed extras (`templates/`, `relink*.sh` helper scripts) — approved repo bytes/worker helpers, not secrets; staging-manifest deviation, disclosed by worker, non-blocking but should be reflected in the recipe manifest. Prior `--rm` probe auto-removal confirmed by worker disclosure; acceptable housekeeping record but was a deletion-confirmation-policy deviation at the time.

## Commands run by this reviewer (inside `w002-b11-ws`, `/workspace`, corrected staged bytes)

| Command | Exit | Result |
| --- | --- | --- |
| `node scripts/pnpm.mjs test:box-contracts` | 0 | 7/7 passed |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 7/7 passed; fresh `w002_b11_test_*` DB per file, real migrator 0001–0012 |
| `node scripts/pnpm.mjs build` | 0 | all builds completed |
| `node scripts/pnpm.mjs check` | 1 | tsc clean; boundary passed (59 files); bootstrap 13/14 — `private-api health projection` 6.4 s > base 5000 ms timeout (env-slow); auth suite not reached |
| `node scripts/pnpm.mjs test:auth` | 1 | 24/30, 6 test failures + `environment.test.ts` file-level (0 tests): `routes logout` 6.4 s timeout; `browser-cookie` no Linux chromium; 4 `persistence/*-live` `spawn docker ENOENT`/`infra/compose.yaml` absent |
| `node scripts/pnpm.mjs test:contracts` | 1 | 149/155, 6 failed: 3× >5 s env timeouts, `research/fixtures/candidates.json` ENOENT (not staged), 2× `spawn docker ENOENT` live-DB |
| `node scripts/pnpm.mjs test:planner` | 1 | 49/51: `intake-live` docker ENOENT, `preparation-api` >5 s timeout |

All failures are environment-dependent; every non-environmental test passes. Failed is recorded as failed — **required `check` and `test:auth` did not pass on this candidate.**

## Substantive code/coverage review (source-level, unchanged since r1)

Confirmed in `store.ts`/`index.ts`/migration and exercised by real-DB tests: session+CSRF revalidation inside every transaction; `permits()` role checks; `FOR UPDATE` head/attempt optimistic concurrency with `stale_version`/`invalid_transition`; `open` gated on exact-hash owner behavior approval; revision invalidates approval; `box_operation_keys` idempotent replay/conflict; scoped tokens bound to box/attempt/capability with `token_hash` storage; separate behavior approval / review / merge approval / merge record objects; executor self-approval, self-review and self-merge refused; immutability triggers verified live (`box_record_immutable` on merge approvals); `assertNoRestrictedFields` contamination refusal; migration replays cleanly to idx 12.

Residual coverage gaps (observed, non-blocking but record for later tasks): no test for `hybrid` executor kind, attempt `cancelled`/`closed` transitions, `maxAttempts` boundary, expired scoped token, `recordedBy` mismatch on `recordEvaluation`, token `attempt_id` cross-attempt binding on submit, or non-owner `approveBehavior`/`assign`/`applyMerge` negative paths (owner-role requirement is asserted in code but not directly exercised); `read()` superseded-approval flag untested. Behavior contract correctness holds; coverage depth is thinner than the acceptance text implies in places.

## W002 resource audit (non-secret metadata only)

- `w002-b11-ws`: readonly rootfs=true, CapDrop=[ALL], no-new-privileges, user 1000:1000, 2 GiB/2 CPU/256 pids, single rw bind `stage→/workspace`, net `w002-b11-net` — compliant.
- `w002-b11-db`: 256 MiB/0.5 CPU/128 pids, tmpfs data, `w002-b11-net` — compliant with recipe (DB flags per recipe).
- `w002-b11-net`: `Internal=true` — compliant.
- `w002-b11-srcimg`: `Created`, never started — inert as claimed.
- `w002-b11-stage-helper`: **deviations confirmed** — RW rootfs, no cap-drop, no no-new-privileges, no resource limits, default `bridge` network (has egress), rw bind `stage→/stage`, user 1000:1000. Staging tool only, not a check executor, but its bridge egress sits outside the internal-net posture; worker disclosed it. Recommend root record/remediate before reuse.
- All five resources preserved; I stopped/removed nothing.

## Governance verdict (separate, read-only)

Frozen brief bytes intact (digest match); approval binds exact digest/base/scope; wave/state statuses and B1.1 lease fields coherent; no scope expansion observed; approval file correctly records human CEO decision. Governance files are consistent and checkpoint-eligible as observed; this is not acceptance and I wrote no state/approval bytes.

## Pilot gates (corrected bytes)

- G1 pass — actual approval bound to frozen digest.
- G2 pass — sole-worker receipt + accurate `candidate-manifest.json` on identical bytes.
- G3 pass — this distinct review binds identical recomputed bytes.
- G4 pass — durable worker/reviewer evidence persisted under `evidence/B1.1/`.
- G5 degraded/not passed — no actual human START session resumption demonstrated.

## Verdict: `not_accepted`

The r1 scope violations are fully corrected and the candidate's Box behavior and suites genuinely pass. However required `check` and `test:auth` still fail (environment-dependent) — failed/unavailable is not pass, and no accepted verdict is possible under the current verification policy.

## Read-only feasibility recommendation for a narrow revised W002 verification brief

Failing items and needs (verified by me):

1. `tests/auth/persistence/{auth,workflow,lifecycle,migrations}-live.test.ts` — exec `node scripts/verify-*.mjs` which spawn `docker … compose exec` via `scripts/docker.mjs`. No docker binary in the workspace (`ENOENT`) and `infra/compose.yaml` is not staged. Options: (a) approved controlled exec-proxy/shim seam translating compose-exec into docker-exec on a host-managed prestarted disposable stack on `w002-b11-net` (new seam, needs explicit approval); (b) host-managed fixture execution (prohibited today — candidate/tests must run in-workspace); (c) mounting the Docker socket (grants daemon control — recommend NOT approving). Feasible only via a new explicitly approved seam.
2. `tests/auth/bootstrap/browser-cookie.test.ts` expects Linux chromium at `/workspace/.runtime/browsers/chromium_headless_shell-1243`. Verified: the pinned image contains playwright(-core) 1.63.0 but no chromium/headless_shell binary anywhere; no egress for download; host `.runtime/browsers` holds Windows builds. Feasible only if a revised brief approves staging an existing locally-available Linux chromium build at that exact path or a new pinned image containing it.
3. Env-slow timeouts (`routes logout` 6.4 s, `private-api health` 6.4 s, contracts/planner about 6.5-7.4 s vs the 5000 ms default): fixing via `testTimeout` was the r1 violation path; alternatives are an explicitly leased tooling-config accommodation or a faster approved workspace - either needs brief-level authorization since touching `scripts/vitest.config.mjs` requires a lease.
4. `research/fixtures/candidates.json` ENOENT - needs `research/` added to the approved staging manifest (repo bytes, currently excluded).
5. `infra/` excluded - needed only if a compose seam is approved.

I did not implement any of this. Any candidate or scope change reopens review.
