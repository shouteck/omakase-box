# Status

Replaced at every wave close. Last written 6 October 2026 by Claude as CTO, after the owner stopped the run that closed K4, K5 and K8.

## Now

- **Accepted on master:** B0, B1.1, D1.1, the lean kitchen, K1, D1.2, K2a, K2b, K3, **D2.1** (`bce810d`), **D2.2** (`85035a9`), **D3.1** (`48ac79a`), **K4** (`01c675b`), **K5** (`13f7daa`), **K8** (`2a9114d`).
- **The delegation loop is closed end to end:** `packages/box-package` + `packages/box-cli` export a plain Box folder (box.json, compiler-derived source closure, editable + generated scaffolds, toolchain metadata, per-file SHA-256 provenance, staged lockfile, self-contained `box/submit.mjs`). A blind taster completed Request A from the folder alone and produced a bound `submission.json`; owner-side `box verify` applied it at its base, ran install/compile/outcome checks through the real loader and server, and scratch-merged with attempt identity. A no-op patch provably fails as `implementation-failure`.
- **Verification is fully Docker-free:** every ordinary suite runs on the host against the disposable embedded Postgres; `test:containers` exists separately and needs Docker + the frozen M-series image.
- **In flight:** R1, approved by `START.md: R1`: deliver the kitchen-stats Usage-section removal through a real Box and a package-only agent. K9 remains unstarted. `verify` now runs off-machine on every code push to master (`.github/workflows/verify.yml`, free tier, ~3–4 min/run); kickoff checks `gh run list` — a red master run blocks new waves. `node scripts/kitchen-stats.mjs` now reports kitchen numbers from `.kitchen/runs` + Git; verify warns `STALL` past 6 non-PASS runs or 90 min on a branch and **reuses** steps already PASS on the same commit (`reused@<run>`, ~95% faster on repeats); `--fresh` forces real runs, `check` scopes suites by changed paths (`--full` runs everything).
- **Held:** nothing.

## Approved by the CEO

- 5 Oct 2026: lean kitchen, Claude adapter, roadmap resequencing.
- 5 Oct 2026: hold W005 and finish D1.2 under the new rules; remove the old kitchen's containers; K1.
- 5 Oct 2026 (overnight message, naming = approval): **D2** and **D3.1**, plus kitchen waves K2 and K3.
- 6 Oct 2026: an off-machine verify run on GitHub Actions, free tier (K8); removing legacy material from master after tagging (K9); a milestone walkthrough for the owner; no reliance on a second model family.

## Next

This START message runs R1 only, then stops. Remaining options require a new START message:

1. **R1:** approved and in preparation; remove the obsolete kitchen-stats Usage section through a Box. Record preparation and verify costs; no unobserved before/after claim.
2. **K9:** remove legacy material from master behind the tag `legacy-2026-10-06`. Brief ready at [waves/K9.md](waves/K9.md), nothing started. `START.md: K9`.
3. **D4:** the Box-versus-contractor comparison. `START.md: D4`.

## Night queue

For `START.md overnight`. Entries marked "needs naming" run only if the owner names them in that message.

1. R1 (needs naming).
2. K9 (needs naming).
3. K6, then K7: only if `node scripts/kitchen-stats.mjs` shows verification above 15% of a run after R1.

D4 is not on the night queue: the owner should read its result before anything is built on it.

## Known problems

None blocking. Leftovers are in [BACKLOG.md](BACKLOG.md).

## Decisions waiting for the CEO

- None for R1. After this named wave closes, stop; K9 or D4 requires a new START message.
