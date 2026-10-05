# Station: Service and data

The private API, the Box store, migrations and auth. Home of B1.1 (accepted) and the server half of D1.2.

## What this station knows

- Stack: Fastify, PostgreSQL through `pg`, Drizzle (`drizzle-orm/node-postgres`), Zod. Code is under `services/private-api/`; Box tables and the store are in `services/private-api/boxes/store/`.
- Migrations are hand-written SQL in `services/private-api/db/migrations/` with an entry in `meta/_journal.json`. Add a new numbered file and journal entry; never edit an earlier one.
- Box records are immutable and versioned. A changed input makes a new version and invalidates the approvals that depended on the old one. Transitions are checked on the server by role; an executor cannot approve its own work. Operations carry idempotency keys: the same key with the same request replays, with a different request it fails.
- Tests get a disposable Postgres from `scripts/verify.mjs` (embedded, no Docker) through `BOX_TEST_DATABASE_URL`. The helper is `migratedPool` in `tests/box/auth/support.ts`: it creates a database per call and drops it when the pool ends. Reuse it; do not write a second one.
- `scripts/boundaries.mjs` (part of `check`) enforces which packages may import which. The external side must not import private code.

## Traps

- **Never hand a connection URL to `pg`.** Its parser lets a `?host=` parameter override the hostname, which bypassed the loopback check in K1. Validate, then build the pool from explicit host, port, user, password and database.
- **Always call `pool.end()` in `afterAll`.** That is what drops the test database.
- **Legacy `*-live.test.ts` files** shell into the old `private-task-mvp-synthetic` container stack, and some run inside `check`. `auth-live` returns HTTP 429 when `check` runs twice in a row. Wait about five minutes between full verify runs. Do not "fix" this inside an unrelated wave.
- **Do not weaken a security control to make a test pass**: rate limits, role checks, session and CSRF handling stay as they are.
- `scripts/box-verification/` and `tests/box/verification/` are the old container harness. Leave them alone until the cleanup wave.

## The pass checks

- Run the migration from empty in the disposable database (verify does this through the helper) and confirm earlier migrations are untouched in the diff.
- Attack every guard the wave adds or changes with hostile inputs: wrong role, stale version, replayed key with a different body, forged identifiers, cross-Box access.
- Confirm nothing is left behind after verify: no Postgres process, temp directory or database.
