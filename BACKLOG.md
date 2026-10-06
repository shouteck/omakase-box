# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

- `readContext` is declared in `box.json` but its files do not ship: the blind taster saw the names, not the content. Decide whether read context ships (it discloses more) or the contract stays as it is. From D2.2.
- The in-folder seal (`box/submit.mjs`) does not hash generated members (evaluator, scaffolds, the tool itself), so a recipient could weaken its own evaluator and still seal. The owner-side verify catches it today. From D2.2 and D3.1.
- On Windows a case-aliased input that is not excluded can be emitted under the alias spelling and ship twice. It cannot leak excluded files. From D2.1.
- Owner checks are a registry in `packages/box-package/owner-checks.ts` keyed on the evaluator generator. A new kind of request needs a registered check, or verify refuses it as a preparation defect. From D3.1.
- Patch-apply containment is by path text. A committed symlinked directory under an editable path could redirect a scratch write. No symlinks in this repository today. From D3.1.
- Requesters see Amend controls on Boxes they did not author. The server refuses correctly; the control should be hidden. From D1.2.

## Kitchen and environment

- Property-based guard tests and Box packaging mutation checks: retained from the kickoff inbox; require a separately named kitchen wave.
- K6 added packaging operation counts and an explicit full-profile budget; invocation/PID time-window counting can miss reused PIDs or mix simultaneous matching logs. Give counters a run identity before relying on parallel measurements.
- Monthly upstream pstack comparison: last done 5 October 2026 against 0.15.10; not due at this kickoff.

- Verify reuse trusts `.kitchen/runs` records by consistency, not signature — a hand-forged fully-consistent run dir can fake a reused PASS. Accepted; `--fresh` is the antidote and the pass uses it when it doubts a record. From K5.
- The `check` path→suite table covers direct imports only; a transitive edge can slip scoped `check`. `--full` is the documented backstop. From K5.

- Ports 4000 and 4001 are held by Docker Desktop when it runs; host tests bind 127.0.0.2 with loopback mirrors (`scripts/host-test-runtime.mjs`).
- `tests/box/delegation/support.ts` caches its run directory per module, so one `delegationPool()` per test file. Fix when a test needs two.
- Three suites carry host-bound tests excluded from CI (`test:box-package` case-alias, `test:security` absolute-path probe, `test:containers` local-image): a per-file split or linux lane would restore them. From K8.
- `doctor.mjs` reports the `databases` check as unverified since the synthetic stack was removed. Honest label, not a failure.
- Cook and pass have been the same model family on every wave so far. Accepted; see "Review" in KITCHEN.md.
