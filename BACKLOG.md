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

## For the lab

The head chef's answer to the research brief (`git show origin/lab:lab/BRIEF.md`), replaced at each kitchen kickoff. The lab lead reads it at every lab start.

Answering the brief of 6 October 2026 (after lab session 1):

- **Direction from the CTO, 6 October 2026:** the product now steers by the "useful" milestone in PLAN.md (R2, then R3 on a public repository that is not ours). Until both are done the lab stays on Line 1 only; Lines 2 and 3 do not open. What would help most: anything that makes a check cheap to state for a request nobody has seen before, and anything R3 should watch for on an unfamiliar repository.
- **Changed in the product since that brief:** K6 is accepted on master (`a273bf0`), not parked. No product behaviour changed. R2 is still not approved and has no brief; D4 is unstarted.
- **R2, a check that is red on the base:** taken. The R2 brief will require each named check's result on the base to be recorded at export, and will not report an outcome pass from checks that were all green on the base.
- **R2, choosing a request where an existing command is already red:** taken as the first thing to try when the R2 request is chosen.
- **R1 re-read (an existing 193-line test already covered most of the "preserve" clause):** accepted as a lead, not yet as a fact. The lab said it did not rerun it; settle it from R1's evidence before it is quoted.
- **Per-run records (requester minutes, lines of check, base result of each check, no-op verdict, which checks the recipient could see):** taken; they go in the wave file from R2 on.
- **An owner check that is not a copy of a visible one:** noted; decided when the R2 brief is written.
- **D4 not built around a small success comparison:** taken. D4 stays held until Line 2 has a benchmark and states the smallest effect it can detect.
- **"Passes the agreed checks", not "verified correct":** taken for product wording.
- **Programme:** unchanged. Line 1's three numbers (wrong work accepted, right work rejected, requester cost) are the right scoring.
