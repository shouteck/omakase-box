# R3 readiness report — colinhacks/zod @ 0b216ef674e297ebe41d8bf902262e56f8755822

Recorded by cook, wave/R3, 2026-10-06. All upstream code execution inside disposable
containers; no install scripts (`--ignore-scripts` / nub's equivalent); tests run
with `--network none`; install only with network up. Host ran `gh` read-only + docker
control only. No checkout hooks run (git hooks never enabled; clone only).

## Repository pin

- Repo: https://github.com/colinhacks/zod (MIT License), default branch main
- Pinned commit: `0b216ef674e297ebe41d8bf902262e56f8755822` (committed 2026-10-02T18:08:53Z; HEAD at survey time)
- Declared toolchain (from CONTRIBUTING.md + package.json): **nub v0.8.3**
  (`packageManager: "nub@0.8.3"`), Node via `.nvmrc`, lockfile = `pnpm-lock.yaml`
  (lockfileVersion 9.0, used by nub). typescript ~5.5.4 devDep at the pin;
  Vitest 4.1.5 (lockfile). NOT pnpm-managed despite the pnpm-lock.yaml filename.
- Image: `node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152`
  (project-pinned trustedNode). Derived tool image `kitchen-r3-421d276a-tools`:
  + git 2.39.5, curl; pnpm 10.34.5 via `npm i -g`; nub 0.8.3 via
  install.sh at nubjs/nub@0ae8783f1f93763c56dfc827892cfb679e8a0a77.
- Resources: volumes `kitchen-r3-421d276a-src` (clone), `-product` (cli.mjs + zod/ts
  deps), `-out` (probe box dir), `-nub` (unused after image bake), image
  `kitchen-r3-421d276a-tools`. UUID root `kitchen-r3-421d276a`.

## Install (setup phase, network on)

- `pnpm install --frozen-lockfile --ignore-scripts` → ERROR "This project is
  configured to use nub" (evidence/install.log). With
  `--config.package-manager-strict=false --no-frozen-lockfile` →
  ERR_PNPM_WORKSPACE_PKG_NOT_FOUND: root package.json uses npm-style
  `"workspaces"` field, no `pnpm-workspace.yaml` exists; lockfile also missing
  `zod@4.6.5` workspace entry (evidence/install2.log, install3.log). pnpm cannot
  install this repo at this pin without adding files — named gap.
- `nub install --frozen-lockfile --ignore-scripts` → succeeded: the full dependency
  tree printed and installs were usable downstream (evidence/nub-install.log).
  Its `INSTALL_EXIT=0` marker is a pipeline artifact, not the command's exit —
  see the audit amendment; success rests on the visible resolved-tree output.
  Faithful to the repo's declared toolchain.

## Owner-context test runs (existing commands, unchanged, network none)

Command form: `cd /src/zod && nub exec --node vitest run <paths>` from repo ROOT
(repo's own `test` script shape). Results:

- Intended predeclared sample (evidence/predeclared-sample.md), 4/202 filesystem
  test files: string.test.ts, codec.test.ts, mini object.test.ts,
  issue-schema.test.ts → runner reported **all green**, 315 tests, ~32 s incl.
  typecheck (evidence/sample-tests-root.log). Reviewer correction, accepted: the
  declaration file claims ~04:55Z while the result's own start is 04:46:27Z, so
  declaration-before-results is **not proven** and the wave's predeclaration
  requirement is recorded **NOT MET**. The run's green outcome is corroborated
  only for `object.test.ts` by the reviewer's independent exit-0 run below; the
  log's appended `VITEST_EXIT=0` is a pipeline artifact, not the runner's exit.
- Whole `packages/zod` vitest project: runner reported **all green — 8299 tests
  over 588 Vitest project file instances**, typecheck no errors, 198 s
  (evidence/zod-package-suite.log). Denominator correction: 588 is project
  instances (each file can appear under compile-mode, zod and TS projects), not
  filesystem files — 202 `*.test.ts` exist under `packages/` at the pin, 196
  under `packages/zod`, 742 tracked files total (reviewer recount). The suite's
  `EXIT=0` marker is also a pipeline artifact; the pass count is
  runner-reported, not independently re-run.
- Other workspace projects (resolution, integration, tsc, treeshake, mini, docs):
  5 files pass; **3 treeshake files red — "zod is not built, run nub run build
  first"** — missing-built-artifact infrastructure, not defects
  (evidence/other-projects-suite.log). `nub run build` also failed in-container
  (zshy `TypeError: Cannot read properties of undefined`), so those files stayed
  unreachable; the suite's `EXIT=0` marker is a pipeline artifact.
- Lint: `nub exec --node biome check .` → runner printed "Checked 457 files…
  No fixes applied" (evidence/biome.log). Its `BIOME_EXIT=0` marker is a
  pipeline artifact; clean status rests on the printed summary.
- TS-7.1-nightly probe for issue #6637: `tsc --noEmit -p packages/zod/tsconfig.test.json`
  under typescript@7.1.0-dev.20260929.1 → **no error output observed**; no
  existing file triggers TS5115 (evidence/ts-dev-typecheck.log). The
  `TSC_EXIT=0` marker is a pipeline artifact; the claim is empty diagnostics,
  not a captured exit.

### Runtime-path notes (real findings)

- `vitest run` from `packages/zod/` fails at startup: merged root config's
  `projects: ["packages/*", "./vitest.compile.config.ts"]` resolves inside the
  package dir → Startup Error (evidence/sample-tests.log). The existing command
  is root-cwd only.
- Test files import `zod/v4` / `zod/mini` package specifiers resolved via the
  `@zod/source` vitest condition to local `src/`. In a Box, `zod` would resolve to
  the PUBLISHED package — tests would exercise registry code, not shipped source
  (unequal-sides hazard), unless the Box also ships the vitest config + the source
  tree the condition maps. Travel viability untested beyond the probe below.

## Box-travel probe (R2 product, in-container)

- Trusted product copy: `packages/box-cli/dist/cli.js` (built from wave base)
  → `/product-run/cli.mjs` + `npm i zod@4.6.5 typescript@6.0.3 --ignore-scripts`.
- Probe agreement `research/box-delegation/r3/probe/agreement.json`: editable =
  `packages/zod/src/v4/mini/tests/object.test.ts`, one owner guard
  (`vitest run <file>`, cwd `.`), evaluator [], zero request-specific code.
- Export attempts and the exact walls hit:
  1. cli.js is ESM — needs .mjs when copied bare (recorded; packaging doc gap).
  2. `excludedPrefixes` entries must end in "/" (agreement corrected).
  3. `toolchain.typesNode` required (agreement corrected).
  4. `git clone --local` failed with the raw error `Invalid cross-device link`
     on a pack index when TMPDIR (`/tmp`) was on a different filesystem than the
     repo volume; with TMPDIR set inside the repo volume the clone step
     succeeded. Only the error string and the two observed outcomes are claimed;
     a `--no-hardlinks` fallback is an untested suggestion.
  5. Export's base-clone install spawned `pnpm install --frozen-lockfile` with
     **no `--ignore-scripts`** → pnpm's package-manager guard refused:
     "configured to use nub". **Demonstrated blocker: the product assumes pnpm
     install; the repo's declared manager is nub.** Reviewer's wrapper re-run
     (below) captured exit 1 and proved the missing flag; the guard refused
     before any upstream lifecycle script could run — no scripts were *observed*
     to execute, which is not a guarantee none would under a working install.
  Every `EXPORT_EXIT=0` marker in probe-export*.log is a pipeline artifact and
  unreliable; the authoritative export exit is the reviewer's captured 1.

## Issue candidates (`gh` read-only)

Corrected read window: the `gh` issue reads happened after the `packages/zod`
suite finished (~04:54Z by the runner's 04:51:05 start + 198 s) and before the
candidate commit at 05:04:13Z. The earlier "~05:05Z" figure post-dates that
commit and was a projection, not an observation. Per-issue read times inside
the window are not individually recorded. Full list in
evidence/issue-candidates.md (its file header repeats the same projected
~05:05Z; treat it as the window above).

| Issue | State | Why rejected |
|---|---|---|
| #6637 TS5115 on TS 7.1 nightlies, `.catchall(z.json())` | OPEN | No existing file emits TS5115 under the pinned nightly (tsc produced no error output; exit marker unreliable); would need a NEW repro test — banned |
| #6639 NaN intersection throws Unmergable | OPEN | Latent bug; no existing check red at base |
| #6641 z.record skips own `__proto__` key | OPEN | Latent; no existing check red |
| #6621 non-English locales lose Infinity/-Infinity | OPEN | No locale test asserts those tokens (grep) — latent |
| #6648 toJSONSchema non-standard format values | OPEN | Fix would change existing expected values (guard-weakening risk) |

## Verdict

- Existing zod tests ARE runnable in owner context inside a container (nub install +
  root-cwd vitest), but current Box product CANNOT export this repo: pnpm-only
  install assumption (blocker) + package-specifier test imports (unequal-sides risk).
- **No open issue qualifies**: every existing check run is green or infra-red
  (missing build artifact), never defect-red on the pinned base for a real open
  issue. Per the wave rule this is a preparation gap → park; no fabricated red.
- Issue-prep clock: no issue selected, so no prep stage. Stage clocks in
  waves/R3.md.

## Audit amendment (post-review FAIL on 089c89f; prose-only corrections, raw bytes preserved)

- **Exit-capture defect (worker error):** every worker log that ends
  `… | tail -N; echo *_EXIT=$?` records the *pipeline's* status (tail/grep/head),
  not the command's. All `INSTALL_EXIT`, `VITEST_EXIT`, `BIOME_EXIT`,
  `TSC_EXIT`, `BUILD_EXIT`, `EXPORT_EXIT`, `EXIT=` markers in worker logs are
  therefore **unreliable** and stand only as "ran to completion". Where the
  claim rests on them it has been relabeled; semantic claims now cite printed
  runner summaries or absence of error output. Authoritative captured exits are
  the reviewer's: sample `object.test.ts` exit 0, export exit 1.
- **Predeclaration not proven → NOT MET:** `predeclared-sample.md` claims
  ~04:55Z but the sample result starts 04:46:27Z. Committed evidence cannot
  establish declaration-before-results; the wave's required predeclared-sample
  condition is recorded NOT MET. No new predeclaration was backfilled; the
  sample run stands as an *undeclared-then-run* green observation only.
- **Timeline corrections (observed anchors only):** session start 04:34Z
  (`date -u`); tool image created 04:43:46Z (reviewer, image inspect); sample
  run start 04:46:27Z (runner); `packages/zod` suite 04:51:05Z + 198 s;
  worker `date -u` check 05:00:14Z; candidate commit 05:04:13Z. All earlier
  "~05:05Z / ~05:20–35Z" stage figures in this file and the wave Result were
  projections written before the commit, not observations — now corrected or
  labeled windows. Total observed active elapsed ≈ 30 min (04:34→05:04Z),
  inside the 90-min cap.
- **UID:** worker containers ran the image's default user (root); the actual
  UID of worker runs was not recorded and is unknown. The reviewer's runs used
  UID 65534 and succeeded.
- **Denominators:** 202 filesystem `*.test.ts` under `packages/` (196 under
  `packages/zod`), 742 tracked files at pin; the 588 figure is Vitest project
  file instances, a different measure — not a file-count denominator.
- **Useful conditions restated:** real external repo + open-issue survey —
  met; a qualifying real open issue selected — **not met**; predeclared
  sample — **not met**; Box/recipient/no-op/owner-verify — **not tested** (no
  Box ever emitted).

## Independent reviewer re-run (2026-10-06, review root `kitchen-r3-review-a9f0b1c`)

Review image inspected before use: `kitchen-r3-421d276a-tools` image/config digest
`sha256:cf1565a4891942ee65819e1e278e8df5cf28a5299a60ba0677a9e004f73c38af`;
base `node:24.11.0-bookworm-slim@sha256:76d0...152`, workdir `/work`, default
entrypoint `docker-entrypoint.sh`, no Docker socket mounted. Reviewer-owned
volumes were `kitchen-r3-review-a9f0b1c-{src,product,out}`; all containers used
`--network none`, UID/GID 65534 for work runs, `--cap-drop ALL`,
`--security-opt no-new-privileges`, `--read-only`, memory/CPU/PID limits, and no
credentials or private-owner mounts. A root setup container had only `CHOWN`
added to make copied data writable by UID 65534.

Baseline reproduction (own copied source at pin, writable review volume):

```text
docker run --rm --network none --user 65534:65534 --cap-drop ALL \
  --security-opt no-new-privileges --read-only --memory 2g --cpus 2 \
  --pids-limit 256 --name kitchen-r3-review-a9f0b1c-vitest2 \
  -v kitchen-r3-review-a9f0b1c-src:/src -w /src/zod \
  kitchen-r3-421d276a-tools sh -c \
  'node node_modules/vitest/vitest.mjs run packages/zod/src/v4/mini/tests/object.test.ts; code=$?; echo REVIEW_VITEST_EXIT=$code; exit $code'
=> 3 test files passed, 54 tests passed, no type errors, REVIEW_VITEST_EXIT=0
```

Export-gap reproduction used reviewer-owned minimal agreement data (same
`object.test.ts` editable/entrypoint; baseCommit pinned to `0b216ef...822`; one
owner `vitest` guard) and a controlled `/out/pnpm-ignore` wrapper that records
arguments, accepts only `install`, and appends `--ignore-scripts` before running
pnpm:

```text
docker run --rm --network none --user 65534:65534 --cap-drop ALL \
  --security-opt no-new-privileges --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m --memory 2g --cpus 2 \
  --pids-limit 256 --name kitchen-r3-review-a9f0b1c-export \
  -e TMPDIR=/src/tmp \
  -v kitchen-r3-review-a9f0b1c-src:/src \
  -v kitchen-r3-review-a9f0b1c-product:/product:ro \
  -v kitchen-r3-review-a9f0b1c-out:/out \
  kitchen-r3-421d276a-tools sh -c \
  'node /product/cli.mjs export /out/review-agreement.json --repo /src/zod --out /out/box --pnpm /out/pnpm-ignore; code=$?; echo REVIEW_EXPORT_EXIT=$code; exit $code'
=> export failed: base checkout install failed: WRAPPER_ARGS:install --frozen-lockfile
   WARN The "workspaces" field in package.json is not supported by pnpm...
   ERROR This project is configured to use nub
   REVIEW_EXPORT_EXIT=1
```

This independently confirms two things: the product invoked the supplied install
command as `install --frozen-lockfile` with **no `--ignore-scripts`** (the
reviewer wrapper added it), and pnpm's package-manager guard refused before any
upstream lifecycle script could run. It also confirms the nub/package-manager
export blocker. No Box was emitted.

Recount: `find packages -path '*/node_modules' -prune -o -name '*.test.ts'`
= **202** test files; `packages/zod` alone = **196**. The 588 in
`zod-package-suite.log` is Vitest project instances/files (each source test can
appear under normal, compile-mode and TS projects), not a filesystem file-count
denominator. `git ls-files` at the pin inside the clone = **742** tracked files.

Chronology findings: image created 2026-10-06T04:43:46Z; sample result starts
04:46:27Z; `predeclared-sample.md` says ~04:55Z; the candidate commit is
2026-10-06T05:04:13Z while the wave says issue reads ~05:05Z and report/close
~05:20–05:35Z. Several worker raw logs append `EXIT=0` after visibly failed
commands (`probe-export*.log`, `sample-tests.log`, `other-projects-suite.log`,
`build.log`), so those markers are not exact exit records. The independent
export above records the actual exit as 1.
