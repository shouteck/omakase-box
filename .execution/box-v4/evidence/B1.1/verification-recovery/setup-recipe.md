# W002 r2 — verification-recovery staging recipe (preflight 1)

Wave `W002`, task `B1.1`, authority `.execution/box-v4/briefings/W002-r2.md` r2 SHA256 `1ce91643f6b24e0434b49594b5344de54d7d5bb8a351441b7018cbdd93802167` + approval `Approve` observed `2026-10-04T15:50:36.0926937Z`; original r1 authority preserved. Worker `e44008a7` (sole writer). Preflight attempt 1 of max 2.

## Resources (all pre-existing W002-owned, preserved; nothing created/stopped/removed in phase 1)

- `w002-b11-net` — internal bridge, no egress.
- `w002-b11-db` — postgres:17-bookworm pinned digest, tmpfs data, synthetic fixture DBs.
- `w002-b11-ws` — pinned image `sha256:99fc47...65c9`, user 1000:1000, read-only rootfs, cap-drop ALL, no-new-privileges, internal net, 2 GiB / 2 CPU / 256 pids, bind `C:/Users/shout/AppData/Local/Temp/w002-b11-stage` -> `/workspace`.
- `w002-b11-srcimg` — Created, never started (inspection artifact).
- `w002-b11-stage-helper` — STOPPED by root (noncompliant: bridge egress, missing hardening). Not reused; no replacement helper created in phase 1 — host-side `cp` performed staging directly.

## Staged manifest (phase 1)

Everything from the r1/r2 recipe plus the approved r2 expansion:

- Prior: `apps/`, `examples/` (includes `examples/private-shop/reference-solutions`), `packages/`, `services/`, `tests/`, `scripts/`, `templates/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, container-side toolchain `node_modules`.
- New r2 source bytes staged: `scripts/box-verification/{fixture-exec-host.mjs,fixture-exec-client.mjs,fixture-command-manifest.json}`, `tests/box/auth/{fixture-transport.test.ts,negative-scope.test.ts}`, modified `scripts/docker.mjs`, `scripts/vitest.config.mjs` (approved `testTimeout: 30000` only).
- Expanded manifest per r2 §"Synthetic service and staging": `templates/**` (already staged), `research/fixtures/candidates.json` (sha256 `b5c09b7f7b55bb42d68a460f5112b2fa9021b0f65d42f834466a08fcad15f9ba`), `infra/compose.yaml` as fixture metadata only (sha256 `b0a6c4c5c192894672e6b56782ef8ef34f857c595d43b3420ade3d2ee5cbb44c`, never executed by worker).
- Worker-only helpers present in stage (not candidate bytes): `gen-manifest.mjs`, `relink*.sh` — recorded honestly; generated/used inside container only.
- Still excluded: `.runtime/**`, `.env*`, `.git`, `dist/` host outputs, `.execution/**`, `docs/`, host `node_modules`, `research/**` other than the listed fixture, `infra/**` other than `compose.yaml`.
- No prohibited bytes (`.runtime`, env, `.git`, host `node_modules`) staged.

## Mailbox design (phase 2; not executed)

- Mailbox dir: `/workspace/.verification-mailbox/{requests,responses,state}` inside the existing staged bind (host-visible at `.../w002-b11-stage/.verification-mailbox`). No new mount, no listener.
- Host relay (`fixture-exec-host.mjs`) polls the dir, maps `commandId` -> fixed `docker exec` argv into `w002-b11-svc-private-api`/`w002-b11-svc-external-api` per `fixture-command-manifest.json` only. Not started in phase 1 — awaits independent exact-bytes review.
- Workspace side: `BOX_VERIFICATION_TRANSPORT=mailbox` + `BOX_VERIFICATION_MAILBOX=/workspace/.verification-mailbox` activate the client inside `scripts/docker.mjs`; unset/unknown values fail closed and default behavior is unchanged.

## Browser acquisition (phase 2; not executed)

- Bound in `browser-manifest.json`: playwright-core 1.63.0, browsers.json sha256 `545d52f8...`, chromium-headless-shell revision 1243 (Chrome 153.0.8010.12), cache root `/workspace/.runtime/browsers` (container-local, via `PLAYWRIGHT_BROWSERS_PATH` set by `scripts/suite.mjs`).

## Phase-1 limitations

- No host relay execution, no fixture service containers, no browser download, no daemon access, no host candidate execution.
- `check`/`test:auth` live-persistence and browser tests remain environment-blocked until phase-2 relay/services/browser are stood up under reviewed bytes.

