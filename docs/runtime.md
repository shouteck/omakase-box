# Trusted runtime prerequisites and separation

Status: tested on a clearly synthetic local runtime. Docker Engine 29.8.1/Compose 5.5.1 is now running after user-authorized WSL/hypervisor and vmcompute repairs. Actual own-database identity, external-to-private database denial, secret/source/socket absence, writable separate volumes, loopback publication and transactional owner bootstrap checks passed. A real Chromium bootstrap cookie-policy probe also passed. Full DB-backed sessions/CSRF/roles, independent review, live model and dedicated hostile-code VM validation remain unverified.

The operator supplies Docker/Compose, distinct local secret files and a separately administered evaluator host. The build kickoff does not authorize global software installation or host settings changes. .env.example lists file paths only. No real secret is committed, generated for a customer or printed by doctor.

## Trusted Compose topology

infra/compose.yaml defines separate PostgreSQL 17 instances and DB users, distinct DB/storage volumes, internal DB networks and independent API ingress networks. Databases publish no host ports. API published ports bind only 127.0.0.1. External containers receive only external DB/session/bridge keys and the public release verification key; no private DB, owner bootstrap, private signing/model keys or private storage mounts. The scoped Docker build context excludes private-shop fixtures, execution evidence, secrets, Git history and unrelated files. The external build/runtime stages copy no private application source.

When Docker and operator secret files are available, first validate the configuration using an explicitly selected local environment file, then build/start only trusted services:

    docker compose --env-file .env -f infra/compose.yaml config --quiet
    docker compose --env-file .env -f infra/compose.yaml build
    docker compose --env-file .env -f infra/compose.yaml up -d

Do not print resolved environment/secret contents. Verify distinct underlying secret files, mounted volume ownership for the non-root API user, image contents, database credentials and actual negative network/filesystem access tests before marking M0.2 checked. There is no candidate runner in trusted Compose. The fixed dedicated fresh-VM gate is separate and cannot be satisfied by these containers.

## Startup and owner bootstrap

Ordinary API startup fails closed on missing/invalid required configuration and short/missing secret files. Public errors do not include raw configuration or filesystem paths. Trusted container mode listens on the container interface while published host ports stay loopback. The local health-only synthetic foundation demo explicitly selects SYNTHETIC_BOOTSTRAP_ONLY=true and always reports productReady=false. Never retain that bypass when mounting privileged product routes.

services/private-api/bootstrap/owner.ts fixes owner authority and uses salted scrypt passwords. PostgresOwnerBootstrapStore implements atomic token consumption and owner insertion; owner-cli.ts accepts bounded JSON on stdin, reads only private configured secret files, and returns fixed safe results. Minimal bootstrap tables remain private and must be preserved by later Drizzle migrations. Live PostgreSQL checks verified rollback on insertion failure, one successful creator under concurrent bootstrap, replay denial and refusal to reset consumed authority by changing configuration. All exercised accounts/data are clearly synthetic. No public registration or email delivery is authorized.

The private host and contributor host must remain distinct. The real-browser synthetic bootstrap probe exercises privateSessionCookie/contributorSessionCookie with separate names, no Domain attribute, HttpOnly/SameSite=Strict, and production Secure/__Host- rules. Unknown deployment modes fail closed. The browser sent the private synthetic credential only to private.localhost and never to contributor.localhost. Probe hosts are explicitly mapped to loopback within Chromium, not by editing Windows DNS. M1.3 must adopt these cookie policies and verify full DB-backed sessions/CSRF/roles; health-only APIs still issue no sessions. This bootstrap probe is not full authentication evidence.

## Identified synthetic runtime and resource use

    node scripts/synthetic-runtime.mjs config
    node scripts/synthetic-runtime.mjs build
    node scripts/synthetic-runtime.mjs up
    node scripts/verify-runtime.mjs
    node scripts/synthetic-runtime.mjs stop

This profile uses project name private-task-mvp-synthetic and a tagged .runtime/synthetic-runtime directory. Initialization creates distinct test-only credential/key files and a path-only runtime.env without printing secrets or overwriting unidentified directories. It refuses remote Docker endpoints. Services have bounded per-container memory/CPU; builds run one Compose operation at a time. Stop preserves volumes and one-time authority; do not delete/reset them to make tests pass. The private runtime CLI is exercised only with synthetic accounts. No customer data, model calls, contributor code, paid service or real payment is involved.

Doctor uses the installed local Docker CLI and probes each initialized synthetic service's own database identity while it is running. `doctor --json --passive` avoids active DB probes and reports those capabilities unverified. Successful identity probes do not replace separate runtime-separation tests.
