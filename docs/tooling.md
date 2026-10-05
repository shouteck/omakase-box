# Local development tooling

Use the pinned Node 24.11.0 baseline (Node 24 LTS) and pnpm 10.34.5. The initial Windows host has Node/npm and Git but no global pnpm or Docker. Do not install global tools or change user settings automatically.

## Install

From the workspace root:

    npm ci --prefix scripts/tooling --ignore-scripts
    node scripts/pnpm.mjs install --frozen-lockfile

The wrapper uses repository-local pnpm. It resolves project scripts explicitly, avoiding pnpm's built-in doctor command, and suppresses pnpm banners for machine-readable JSON. With an already configured pinned pnpm, use `pnpm run doctor --json` rather than the built-in `pnpm doctor`.

## Checks and trusted bootstrap demo

    node scripts/pnpm.mjs check
    node scripts/pnpm.mjs build
    node scripts/pnpm.mjs test:bootstrap
    node scripts/pnpm.mjs test:auth -- --suite bootstrap
    node scripts/pnpm.mjs test:contracts
    node scripts/pnpm.mjs doctor --json
    node scripts/smoke-bootstrap.mjs
    node scripts/pnpm.mjs demo

Check runs TypeScript, the external source-dependency boundary check, and the currently implemented bootstrap/auth/contracts suites. Build writes service-local SSR modules and separate Vite UI bundles with no source maps. The smoke script actually starts built services and UIs, uses explicit HTTP Host overrides and stops its children; it does not verify browser cookies or OS hostname resolution.

Each Vite dev server allowlists only its own app root and installed dependency files; contributor /@fs/ requests for private workspace source are tested as denied. Demo children receive a positive system-environment allowlist, not inherited private/model or unrelated credential variables.

The demo is explicitly health-only synthetic foundation mode. It grants no approval, account, DB, model, package, submission, payment or evaluator access. Do not extend its configuration bypass to privileged product routes. Development listeners bind 127.0.0.1:

- http://private.localhost:3000 — private console foundation
- http://contributor.localhost:3001 — contributor portal foundation
- http://private.localhost:4000/health — private health-only API
- http://contributor.localhost:4001/health — external health-only API

Doctor reports capabilities without secrets. Unavailable product suites and `verify:mvp` return exit 2. Do not interpret an exit-zero doctor diagnostic as delivery or real-runner success. Initial contributor.localhost lookups were unverified; the latest doctor observed both hosts resolving only to loopback. Real-browser authenticated cookie separation remains unverified, and the two cookie hosts must not be collapsed.

## Dependency compatibility

Direct package versions are exact in manifests; the lockfile pins transitive resolutions. pnpm enforces seven-day minimum release age and a narrow esbuild install-build allowlist. TypeScript 6.0.3 retains the analyzer compiler API; Vite 8.3.1, Vitest 5.0.1, React 19.3.0, Fastify 5.12.5, Zod 4.6.5, Drizzle 0.45.3/kit 0.31.11, pg 8.23.0 and Playwright 1.63.0 were checked against registry publication/compatibility metadata before selection. No React Vite plugin is needed for the current JSX bootstrap. This is tested compatibility, not a supply-chain/security audit or claim that these versions are newest.

Trusted Node/PostgreSQL registry manifest digests are in scripts/toolchain.json. They are not provenance-audited evaluation images. User-authorized per-user Docker/WSL/hypervisor/vmcompute setup is operational; see docs/runtime.md for the trusted Compose topology. A separate operator-owned dedicated Linux KVM evaluator still remains a prerequisite. No candidate code may run on this workstation.

Install test-only Chromium locally with `node scripts/pnpm.mjs exec playwright install chromium` and PLAYWRIGHT_BROWSERS_PATH set to the absolute workspace .runtime/browsers directory. Suite commands automatically use this repository-local cache, not a user browser profile. The real-browser bootstrap cookie-policy probe passed; full DB-backed authentication remains separate M1.3 work. Run resource-heavy commands sequentially.

## Resumption and evidence

Invoke START.md again to resume persisted work. Only the coordinator uses scripts/execution.mjs; it atomically replaces state and records exact scoped content-digest manifests. Scripts/evidence.mjs records bounded command arrays, times, exits and output under .execution/evidence/<task-id> using exclusive filenames. Use new evidence labels for reruns. Never capture real credentials/customer data in version-control-eligible evidence.

Independent review is unavailable in the current sequential session, so checked tasks remain review/not_available. Git inspection currently fails due to sandbox/user directory ownership mismatch; no Git configuration was changed. Content digests preserve exact review targets without a commit.
