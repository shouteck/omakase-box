# B1.1 — isolated workspace recipe (preflight, before any candidate execution)

Wave `W002`, task `B1.1`, plan `box-v4-2026-10-04.1`, brief `.execution/box-v4/briefings/W002.md` revision `2026-10-04-r1`, digest `sha256:44e984be1e01abfed357945f196f16738e30c43de1e5bb0e2adcdc891d5a7ac9` (recomputed on this host, matches approval record `.execution/box-v4/approvals/W002-approval.json` bound digest). Base revision `cd3feaf0c467df6c4b9734974722f8471f0da891` (master). Adapter `devin_portable_pstack_adaptation`. Worker: sole box-worker dispatch for B1.1.

## Pinned images (cached, verified by `docker image inspect`; no pulls performed)

- Workspace/toolchain: `sha256:99fc47dac8b729a5060068378def035fab6542c9be55885187251291e71e65c9` (`ptm-deps-check`). Observed: no configured `User` (must pass `--user`), `WorkingDir /workspace`, `NODE_VERSION 24.11.0`, entrypoint `docker-entrypoint.sh`, baked `/workspace` snapshot containing `node_modules` + repo dirs (used only as toolchain/dependency substrate; all product bytes come from the staged candidate below).
- Database: `postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`.

## W002-owned resource names (exclusive)

- Docker network: `w002-b11-net` (`--internal`, no egress, no published ports).
- Workspace container: `w002-b11-ws`.
- Synthetic PostgreSQL container: `w002-b11-db`.
- Host staging directory: `C:/Users/shout/AppData/Local/Temp/w002-b11-stage` (staged source + writable build/test storage; disposable, W002-owned).
- Synthetic fixture database names inside w002-b11-db: `w002_b11_test_<uuid-hex>` (created per test run; preserved, never an existing database).

## Fixed argument arrays (no shell expansion of user input)

All Docker invocations go through argument arrays equal to:

1. `docker --context desktop-linux network create --internal w002-b11-net`
2. `docker --context desktop-linux run -d --name w002-b11-db --network w002-b11-net --memory 256m --cpus 0.5 --pids-limit 128 --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_DB=postgres -e POSTGRES_USER=w002_service -e POSTGRES_PASSWORD=<synthetic-generated-hex> postgres:17-bookworm@sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652`
   - Password is synthetic, generated per-run via `crypto.randomBytes`, passed only as container env; never read from real env/credentials, never logged or committed.
   - DB storage is container tmpfs (disposable); no named volumes, no existing DB.
3. Stage toolchain + source:
   - `docker --context desktop-linux create --name w002-b11-srcimg <workspace-image-id>` (kept for inspection, not run)
   - Container-side `cp -a` of the image's baked `/workspace` (node_modules/toolchain) into the staged dir, then host-side overlay of candidate source.
4. `docker --context desktop-linux run -d --name w002-b11-ws --network w002-b11-net --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 2g --cpus 2 --pids-limit 256 --tmpfs /tmp:rw,exec,size=512m -e HOME=/tmp/home -v C:/Users/shout/AppData/Local/Temp/w002-b11-stage:/workspace -w /workspace -e BOX_TEST_DATABASE_URL=postgres://w002_service:<synthetic>@w002-b11-db:5432/<fixture-db> <workspace-image-id> sleep infinity`
5. Checks run via `docker --context desktop-linux exec w002-b11-ws node scripts/pnpm.mjs <script>` (exec inherits container's user/flags; each command array recorded verbatim in receipts).

## Staged source manifest (approved bytes only)

Staged dir = image toolchain (`node_modules`, copied container-side to preserve pnpm symlinks) overlaid with current candidate bytes for exactly: `apps/`, `services/`, `packages/`, `tests/`, `scripts/`, `examples/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `scripts/vitest.config.mjs`.

Explicitly EXCLUDED from staging: `.runtime/**`, `.env`, `.env.*`, any secrets/credentials/session exports, `.git`, `node_modules` from host (container-side `cp -a` used instead), `dist/`, `.execution/**`, `docs/`, `infra/` (not needed by the five required commands; compose is never started). No whole-repo or whole-host mount; the only mount is the staged directory at `/workspace`.

## Policy compliance

- Non-root (`uid=1000 node`, verified via probe `id`), `cap-drop ALL`, `no-new-privileges`, read-only root filesystem; writable storage limited to bind-mounted staged dir + `/tmp` tmpfs.
- Network `w002-b11-net` is `--internal`: DB-only reachability, no host ports published, no Internet egress.
- Limits: workspace 2 GiB / 2 CPU / 256 pids; DB 256 MiB / 0.5 CPU / 128 pids (verified at create time, recorded in preflight receipt).
- No Docker socket mount, no privileged mode, no host credentials, no compose/startup of the application stack, no image pulls, no installs/downloads, no global Docker/WSL/settings changes.
- Only W002-owned resources are ever stopped; they are preserved (not removed) for reviewer inspection unless a specific destructive action receives explicit confirmation.
