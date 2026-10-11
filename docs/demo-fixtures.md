# Synthetic private-shop fixture operations

All data, identifiers, canaries, prices, eligibility and scoring rules are independently invented. This fixture is private developer evidence, not a released contributor package or validated business outcome.

## Build, seed and run

    node scripts/pnpm.mjs install --frozen-lockfile
    node scripts/pnpm.mjs build
    node scripts/pnpm.mjs demo:seed
    node scripts/pnpm.mjs test:contracts -- --suite fixture
    node examples/private-shop/demo.mjs

The optional fixture UI runs at http://private-shop.localhost:3100 and its loopback API at port 4100. This is trusted pre-change code with synthetic subjects only; it deliberately lacks the requested disabled/loading/error handling, unavailable-plan rejection, nonmutating deterministic ranking and owner-agreed stronger response policy. Those gaps establish the work to be done; passing fixture tests is not task acceptance. Never use it for real billing/authentication or execute contributor/model-proposed patches in this host demo.

## Snapshot and answers

fixture.json declares protected dependencies, initial coupling, pre-change revision, snapshot paths and exclusions. `demo:seed` creates only a tagged .runtime/private-shop-demo directory, immutable content-addressed source objects and a hash-bound snapshot manifest. Existing unrecognized directories are refused; no reset/deletion is performed. Reference fixes are under examples/private-shop/reference-solutions and are not planner snapshot inputs. The private source canaries and scoring/eligibility module are not approved public assets.

research/fixtures/candidates.json records single-unit selection/ranking, coherent UI-to-API selection, executable response-policy and combined frontend/backend/policy goals. Broader cloud/data/CI candidates remain individually recorded as needing a new adapter, not rejected merely by discipline. Tags overlap and candidates are not claimed delivered.

The response policy loader parses data only, rejects duplicate/unknown keys and emits fixed headers from trusted HTTPS/localhost context; request forwarding/Host fields do not choose that context. Health is a declared excluded route. Reference policy/runtime checks here use trusted authored fixture code; actual contributed policy execution/transfer still requires the separate real runner gates.
