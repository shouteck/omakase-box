# W002 / B1.1 — worker receipt r3 (verification-recovery amendment, sole worker e44008a7)

Wave `W002`, task `B1.1`, plan `box-v4-2026-10-04.1`, adapter `devin_portable_pstack_adaptation`. Sole worker dispatch `e44008a7`; product retry remains 1 of max 2. Authority: r1 brief `sha256:44e984be…a7ac9` + approval `W002-approval.json`; r2 amendment `W002-r2.md` `sha256:1ce91643…2167` + `W002-r2-approval.json` (CEO `Approve`, observed 2026-10-04T15:50:36Z). Base `cd3feaf0` on `master`. No commits, pushes, merges, delegation or acceptance claimed.

## Work performed this session (all within r2 leases)

1. Implemented the manifest-bound fixture transport:
   - `scripts/box-verification/fixture-exec-client.mjs` — parses a `docker`-style argv against `fixture-command-manifest.json`; denies compose-prefix mismatch, non-exec operations, malformed env pairs, unknown service/workdir/argv, source-digest mismatch; emits a bounded `{schemaVersion:1,requestId,commandId,source,input}` request through a requests/responses mailbox; enforces response identity, output bounds and deadline.
   - `scripts/box-verification/fixture-exec-host.mjs` — host relay: validates envelope shape/size/version, enforces unique requestId (replay denial), rebuilds `docker exec` argv ONLY from manifest-derived container/service/workdir/env fields, verifies inline `-e` source against `sourceSha256`, writes bounded result. Not executed pending independent review (r2 pre-execution gate).
   - `scripts/box-verification/fixture-command-manifest.json` — exact allowlist with per-entry service, workdir, env, argv, `sourceSha256` digests derived from the unchanged `verify-*.mjs` scripts.
   - `scripts/docker.mjs` — added explicit verification-only transport mode; default behavior/arguments/output limits unchanged; unknown/unconfigured mode fails closed.
   - `tests/box/auth/fixture-transport.test.ts` — 7 tests: allowlist mapping + service/env/argv/container-escape denials, `-e` source digest binding, host argv built only from manifest fields, malformed/oversized/non-v1/replay rejection, bounded mailbox round-trip + timeout, fail-closed unconfigured transport.
   - `scripts/vitest.config.mjs` — `testTimeout: 30000`, explicitly authorized by r2 brief line 41 (one worker unchanged; no assertion changes).

2. Staged `infra/compose.yaml` and `research/fixtures/candidates.json` (repo-tracked fixture metadata per r2 staging policy).

## Corrections during verification runs

- `matchEntry` order fixed so a `run` command reports `operation` not `argv_shape`; extra env now emitted as `--env` pairs so it fails match as `unlisted_command` rather than a parse error.
- `migratedPool` (tests/box/auth/support.ts): after the 256 MiB fixture PostgreSQL was OOM-killed by accumulated `w002_b11_test_*` databases, setup now retries up to 3× and drops only same-prefix test DBs with zero active connections. No governed resource or data was dropped/reset; the DB auto-recovered on tmpfs.
- **Disclosure:** my editor script accidentally truncated `support.ts` (replaced from `migratedPool` to EOF). The tail — `account`, `artifact`, `workUnit`, `boxVersion`, `boxContentHash` — was reconstructed against `packages/box-contracts` schemas and every suite usage. All dependent tests and tsc pass on the reconstructed bytes, but the bytes differ from the r1-reviewed file (prior hash `5198c739…`) and must be re-reviewed independently.

## Commands and actual results (inside `w002-b11-ws`, `/workspace`, staged == working-tree bytes, 22/22 sha256 identical)

| Command | Exit | Result |
|---|---|---|
| `node scripts/pnpm.mjs test:box-contracts` | 0 | 2 files, 7 tests passed |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 5 files, 18 tests passed (fresh `w002_b11_test_*` DB per file, real migrator 0001–0012) |
| `node scripts/pnpm.mjs build` | 0 | tsc + all vite builds completed |
| `node scripts/pnpm.mjs check` | 1 | tsc clean; boundary passed (59 files); vitest 6 files failed/6 passed, 6 tests failed/34 passed — all environment-dependent (below) |
| `node scripts/pnpm.mjs test:auth` | 1 | 6 files failed/6 passed — same environment-dependent set |
| `node scripts/pnpm.mjs test:contracts` | 1 | 2 live-DB files failed (transport not executed — relay pre-execution gate); 13 passed |
| `node scripts/pnpm.mjs test:planner` | 1 | 1 live-DB file failed (same gate); 9 passed |

Failed is recorded as failed; nothing was skipped, reclassified or suppressed.

## Honest status vs r2 acceptance bar

r2 requires ALL mandatory checks to pass. Box suites and build pass on exact bytes. `check`, `test:auth`, `test:contracts`, `test:planner` still exit 1 solely on environment-dependent paths because the gated pieces are not yet executed:

- 4 live persistence/auth tests need the independently reviewed host relay + two owned fixture containers (not yet started; pre-execution review gate).
- `browser-cookie` needs the one-time Linux Chromium acquisition/staging flow (browser manifest + revision 1243 evidence is in `verification-recovery/browser-manifest.json`; acquisition not yet performed).
- `environment.test.ts` external-image check needs image build metadata unavailable in the isolated workspace.

## Resources

All five W002 resources preserved: `w002-b11-ws` (up, read-only/cap-drop/no-new-priv), `w002-b11-db` (up; OOM-restarted once, tmpfs), `w002-b11-net` (internal), `w002-b11-srcimg` (Created, never run), `w002-b11-stage-helper` (previously disclosed deviations unchanged — RW, no caps, bridge egress; not used this session). Nothing stopped/removed/dropped; no new images, mounts, permissions or downloads. Synthetic DB password file never read. No `.runtime`, `.env*`, `.git` or host `node_modules` staged.

## Evidence

- `verification-recovery/candidate-manifest-r3.json` — full candidate hashes + check results + authority + disclosures.
- Prior `candidate-manifest.json`, `worker-receipt.md`, `worker-receipt-r2.md`, reviewer manifests/verdicts untouched.

## Limitations

- Candidate remains uncommitted and unaccepted; independent re-review of the r3 bytes (especially reconstructed `support.ts` and the relay/client/manifest trio under the pre-execution gate) is required before any host relay execution or acceptance claim.
- G5 real-session resumption still undemonstrated.
