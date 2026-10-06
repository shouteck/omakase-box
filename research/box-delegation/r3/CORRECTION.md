# R3 blocker correction — record

Wave: wave/R3 correction round (owner-approved, 60 min cook ceiling). Branch
wave/R3 from master `778a31c`. This round fixed prerequisites only: safe
product-controlled installs and reliable run recording. No repository/issue
retry, no recipient, no upstream contact. Prior R3 raw logs and retractions are
untouched.

## What changed (product)

- New module `packages/box-package/install.ts` is the single install boundary.
  `productInstallArgs` enforces `--ignore-scripts` on every product-spawned
  install and refuses (`UnsafeInstall`, a hard failure, thrown before spawn) any
  invocation carrying a lifecycle-enabling flag — including one smuggled in the
  caller's `--pnpm` prefix. `declaredPnpmArgs` applies the same rule to
  agreement-declared `pnpm` command checks: install-like argv gains
  `--ignore-scripts`; a re-enabling flag makes the check an `error` record that
  never spawned, never a pass.
- Call sites rewired, frozen flags preserved: export lockfile resolution
  (`install --lockfile-only`), owner base-clone install and staged-Box install
  (`install --frozen-lockfile`), owner-verify scratch install — all now carry
  `--ignore-scripts`.
- `VerifyCheck` records the exact effective `argv` per step so the invocation
  itself is evidence. Existing checks' meaning unchanged; the one exact-equality
  assertion was strengthened to require `--ignore-scripts` in the install argv,
  not weakened.
- Unsupported package managers remain an explicit preparation gap — no
  nub-specific adapter, no manager coercion, no lockfile/policy change.

## Red first, then green

`tests/box/package/install-safety.test.ts` + `fake-pnpm.mjs` (harmless generic
fixture: logs argv, drops `lifecycle-ran.sentinel` when an install-like call
lacks `--ignore-scripts`, emits a stub lockfile for `--lockfile-only`).

- RED (before product change, scoped run 13:38:49Z): "forces --ignore-scripts"
  FAIL (`expected [...] to include '--ignore-scripts'`); "refuses … re-enables
  lifecycle scripts" FAIL (`expected 'pass' to be 'error'`) — the sentinel would
  have been written.
- GREEN (after fix, scoped run 13:40:25Z): 12/12 pass — forced flag, idempotent
  flag, refusal-without-spawn for `--no-ignore-scripts`,
  `--ignore-scripts=false`, `--config.ignore-scripts=false`,
  `--config.dangerously-allow-all-builds=true`, non-install argv untouched,
  lockfile+base+recipient installs all carry the flag, hostile caller prefix
  refuses the whole export with sentinel never written.

## Recorder (`research/box-delegation/r3/recorder/run-recorder.mjs`)

Small generic CLI/API: `seal <declaration.json>` writes an immutable
`<file>.seal.json` (sha256 of bytes, runId, UTC seal instant — refuses reseal).
`run --declaration <file> --out <dir>` refuses a missing/edited/mismatched seal
and any non-empty output dir (an incomplete or foreign dir is preserved, its
`run.json` persisting `status:"unknown"` until completed). Each command runs
directly (no shell); the record carries executable, verbatim argv, cwd, UTC
start/end, exit, signal, timeout flag, spawn error, bounded (8192-char)
stdout/stderr and an invocation id. Only exit 0 is `pass`; a failing command
followed by a passing one stays `fail`; timeout/signal/spawn-error can never be
`pass`. Honest limit: these records prove structure and ordering inside one
mechanical recipe; a local writer can forge them (same class as the K5 run-dir
limit) — they do not authenticate host or owner.

Tests `tests/box/package/r3-recorder.test.ts` (12/12 green incl. install-safety
file): exit 7 stays fail after a following exit 0; timeout → `timeout`, exit
null; nonexistent executable → `error`, exit null; unsealed/edited/mismatched
declarations refused; populated dir refused with bytes untouched; reseal
refused; output bounded.

## Container dry run (evidence/recorder only, harmless fixtures)

- Image `node@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152`
  (digest-pinned, already local — no pull, no install, no third-party code).
- Command (dryrun/dryrun.log): `docker run --rm --network none --user
  65534:65534 --cap-drop ALL --security-opt no-new-privileges --read-only
  --tmpfs /out:rw,noexec,nosuid,size=16m --tmpfs /tmp:rw,noexec,nosuid,size=16m
  --memory 256m --cpus 1 --pids-limit 64 --name kitchen-r3-fix-138ae38b-dryrun
  -v <repo>/research/box-delegation/r3/recorder:/work:ro -w /work node@…152
  node /work/run-recorder.mjs run --declaration /work/dryrun/declaration.json
  --out /out/run`
- Result (05:43:41Z→05:43:44Z UTC): `DOCKER_EXIT=0`,
  `fixture-fail:fail:7`, `fixture-pass:pass:0` — sealed declaration enforced,
  failing exit preserved, no scripts, no network, non-root, read-only rootfs.
- Resources: root `kitchen-r3-fix-138ae38b`; only the named `--rm` container and
  two anonymous tmpfs mounts — `docker ps -a`/volume listings under that name
  are empty after the run. Nothing else touched.

## Known limits

- Host model: Windows host, Git Bash; `MSYS_NO_PATHCONV=1` needed so `-w /work`
  reaches the Linux daemon unmangled (first attempt exit 125, recorded).
- Sentinel proves only that the flag reached argv on every product install path;
  real pnpm honoring `--ignore-scripts` for upstream lifecycle scripts is
  assumed, not re-derived. Builds legitimately requiring lifecycle scripts would
  now fail as a named gap.
- Recorder runs are synchronous and sequential by design; no parallel-record
  claims.
