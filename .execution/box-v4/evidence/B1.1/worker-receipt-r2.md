# W002 / B1.1 — worker amendment receipt r2 (retry 1 of max 2)

Worker dispatch: `e44008a7` (sole writer). Retry #1 after reviewer `77c88b35` verdict `not_accepted`.
Authority (unchanged, re-verified before writes): wave `W002`, plan `box-v4-2026-10-04.1`, brief `.execution/box-v4/briefings/W002.md` r1 SHA-256 `44e984be1e01abfed357945f196f16738e30c43de1e5bb0e2adcdc891d5a7ac9`, approval `Approve` observed `2026-10-04T08:35:06.1650860Z`, base `cd3feaf0c467df6c4b9734974722f8471f0da891` (master). `waves/W002.json` re-checked: status `approved`, `holdEvents: []`, `revocationEvents: []`. No prior durable routine retry count; budget not reset.

## Correction diff (this retry only)

1. `scripts/vitest.config.mjs` — reversed my prior unauthorized `testTimeout: 30000` addition via precise edit. `git diff` vs base now empty (byte-identical to base). No other line touched.
2. `services/private-api/db/migrations/meta/_journal.json` — restored exact base bytes (LF, `git show cd3feaf` blob) with only the idx-12 object appended; entries idx 0–11 byte-identical to base (`diff` shows insertion only). Fixes the prior whole-file whitespace rewrite flagged as minor.
3. New `.execution/box-v4/evidence/B1.1/candidate-manifest.json` — full candidate+evidence SHA-256 manifest, dispatch id, brief/base/authority, per-command results, scope classification, limitations. `candidate-manifest.txt` retained as history.
4. This receipt. Prior evidence files (`worker-receipt.md`, `preflight-receipt.md`, `workspace-recipe.md`, `candidate-manifest.txt`, `reviewer-*`) untouched.

No product-code, test, expectation or tooling changes were made. No commits/pushes.

## Re-stage

Copied only the two corrected files into `C:/Users/shout/AppData/Local/Temp/w002-b11-stage` (`scripts/vitest.config.mjs`, `meta/_journal.json`); SHA-256 verified identical host-side vs staged. No new images/downloads/mounts; all W002 resources and DB tmpfs preserved.

## Commands and actual results (inside `w002-b11-ws`, `/workspace`, corrected staged bytes)

| Command | Exit | Result |
|---|---|---|
| `node scripts/pnpm.mjs test:box-contracts` | 0 | 7/7 passed (box-schemas 6, boundary 1) |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 7/7 passed; fresh `w002_b11_test_*` DB per file, real migrator 0001–0012 |
| `node scripts/pnpm.mjs build` | 0 | tsc + vite builds completed |
| `node scripts/pnpm.mjs check` | 1 | tsc clean; boundary passed (59 files); bootstrap 13/14 — `private-api health projection` timed out at base 5000 ms (9.4 s container-cold start); auth suite not reached (check stops at first failing suite) |
| `node scripts/pnpm.mjs test:auth` | 1 | 24/30 passed, 6 failed: `routes.test.ts logout` 5 s timeout (7.8 s env-slow); `browser-cookie` missing Linux chromium at `/workspace/.runtime/browsers/chromium_headless_shell-1243`; 4 live persistence tests `spawn docker ENOENT`/`infra/compose.yaml` not staged; `environment.test.ts` file-level (0 tests) |
| `node scripts/pnpm.mjs test:contracts` | 1 | 10 passed/5 failed files; 6 failed tests: 4× 5000 ms timeouts (slow env), 1× `ENOENT research/fixtures/candidates.json` (path excluded from stage), 1× `spawn docker ENOENT` (live DB) |
| `node scripts/pnpm.mjs test:planner` | 1 | 49/51 passed; 2 failed: `intake-live` `spawn docker ENOENT`, `preparation-api` 5000 ms timeout |

All failures are environment-dependent (base 5 s timeout vs ~7–9 s cold startups in the isolated container; absent docker CLI/daemon and `infra/compose.yaml`; absent Linux Playwright browser; `research/` excluded from stage). No candidate-code regression: box suites, boundary and build pass on exact corrected bytes. Failed is recorded as failed, not suppressed.

Consequence disclosed honestly: reverting `testTimeout` restored base behavior and re-exposed environment-sensitivity in four pre-existing tests that exceed 5 s in this container. That is restitution-correct; no timeout was re-added.

## Resource audit (non-secret metadata only; no `docker inspect` env output; synthetic password file never read)

- `w002-b11-ws`: user `1000:1000`, `--read-only`, `--cap-drop ALL`, `no-new-privileges`, network `w002-b11-net`, 2 GiB / 2 CPU / 256 pids, single rw bind `stage->/workspace`, AutoRemove=false — conforms to recipe.
- `w002-b11-db`: postgres:17-bookworm, internal net, 256 MiB / 0.5 CPU, tmpfs data (no mounts) — conforms; recipe intentionally omits cap-drop for DB.
- `w002-b11-net`: driver bridge, `Internal=true` (no egress) — conforms.
- `w002-b11-srcimg`: status `Created` (never run, kept for inspection per recipe), bridge net default, no security flags — deviation noted but inert since never started.
- `w002-b11-stage-helper`: **deviations** — user `1000:1000` but `RO=false`, no `--cap-drop`, no `no-new-privileges`, default `bridge` network (has egress), no memory/cpu/pids limits, rw bind `stage->/stage`. Used for toolchain `cp -a` staging only; not a check executor. Flagged for root: its bridge egress is outside the internal-net posture of ws/db.
- Stage dir: top-level = `apps, examples, node_modules, package.json, packages, pnpm-lock.yaml, pnpm-workspace.yaml, scripts, services, templates, tests, tsconfig.json` + worker helper scripts `relink.sh`, `relink2.sh`, `relink3.sh`. `templates/` was staged during initial remediation (repo-tracked bytes needed by imports) but is not in the recipe manifest list — recorded as a staging-manifest deviation (approved repo bytes, not secrets). `reference-solutions` lives under `examples/` and came with that overlay; no materialized per-package `node_modules` from host — toolchain `node_modules` copied container-side preserving pnpm links, plus relink helper symlinks. Excluded per recipe: `.runtime/**`, `.env*`, `.git`, `dist/`, `.execution/**`, `docs/`, `infra/`, `research/` (last one causes the `candidates.json` ENOENT in test:contracts). No prohibited bytes (`.runtime`, env, `.git`, host node_modules) were staged.
- Prior destructive operation recorded honestly: the preflight `id` probe container ran with `--rm` and auto-removed on exit despite the frozen deletion-confirmation policy. All five named W002 resources currently exist (ws/db up, srcimg Created, stage-helper up, net present). Nothing stopped/removed/dropped in this retry.

## Read-only feasibility assessment (five failing auth tests)

The four `*-live.test.ts` files exec `node scripts/verify-*.mjs`, which spawn `docker --context ... compose exec -T <service> node dist/fixture.js` via `scripts/docker.mjs`/`composeArguments`. Inside `w002-b11-ws` there is no docker binary (`spawn docker ENOENT`) and `infra/compose.yaml` is not staged. To run them in-workspace a revised brief would need: (a) stage `infra/` and any required `dist/` fixtures, (b) a host-managed prestarted compose-equivalent stack reachable on `w002-b11-net`, and (c) an exec channel — either mounting the Docker socket (currently prohibited and would grant daemon access) or an approved stdio proxy/shim translating `compose exec` into a controlled `docker exec`-equivalent on prestarted sibling containers (new seam/tooling, needs explicit approval). Host-side execution of the verify scripts is also prohibited. **Verdict: infeasible under current constraints**; the minimal-change path is a revised verification brief explicitly authorizing either a controlled exec-proxy seam or host-managed script execution against a disposable stack.

`tests/auth/bootstrap/browser-cookie.test.ts` launches Playwright chromium expecting `/workspace/.runtime/browsers/chromium_headless_shell-1243`. The pinned image contains no chromium/headless_shell (filesystem search empty); `playwright-core@1.63.0` is installed but browsers require download (no egress). Host `.runtime/browsers` holds Windows binaries — unusable in Linux container. Feasible only if a revised brief approves staging a Linux chromium build into the stage dir at that exact path (no download, existing local/pinned source required) or a new pinned image containing it. **Verdict: infeasible as-is; feasible with a narrow approved Linux-browser staging exception.**

## Limitations

- `check`, `test:auth`, `test:contracts`, `test:planner` exit 1 in this isolated workspace — environment-dependent only; recorded as failed, not passed.
- Independent re-review of the corrected candidate bytes (see `candidate-manifest.json`) is required; this worker does not self-accept.
- No commits/pushes; no governance/state/approval writes; G5 resume still undemonstrated.
- Retry budget: retry 1 of max 2 consumed.

