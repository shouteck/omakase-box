# Assurance model

This document describes the assurance vocabulary and what each implemented verification layer of this MVP establishes — and what it explicitly does not establish. It is descriptive of the implemented system at its current revision. It is not a certification, not a semantic confidentiality guarantee, not a correctness proof and not an empirical guarantee about humans, models or codebases.

## Assurance labels

Results are labelled with the four project labels:

- `proved` — a real proof is present and its assumptions are stated. Currently no product runtime path carries this label.
- `bounded` — the property is checked exhaustively or structurally inside explicitly stated bounds; nothing is claimed beyond those bounds.
- `tested` — the property ran as an automated check in this workspace against synthetic fixtures at a recorded revision.
- `unverified` — not checked, unknown, timed out or unavailable; reported explicitly and never silently treated as passing.

## Verification layers and their current status

1. Shared contracts (`packages/contracts`): application-owned schema validation plus composition link invariants — single writer per path, no dangling links, no duplicated or conflicting identifiers, interface compatibility checks, end-to-end requirements with whole-task check coverage, connected work units, acyclic start dependencies. Status: `bounded` structural validation of declared data.
2. Boundary analysis (M3.1): read-only TypeScript AST dependency/capability linting over hash-verified captured bytes. Findings are advisory; analyzed code is never executed; reports disclose limits and disclaimers. Status: `bounded`; static linting is never labelled a semantic confidentiality proof.
3. Composer (M3.2): deterministic binding of re-validated provider proposals to exactly one composed task, one private integration plan and a cost/retained-work record; every public requirement must trace to the approved intent; unsupported results flow through explicitly with retained work instead of silent shrinking or layer-splitting. Status: `bounded` structural composition of synthetic proposals.
4. Contract-fit checks (M3.3, this layer): an independent property checker over composed-partition data and observed check results, a bounded 0..4-item ranker model with an exhaustive checker, and private caller-assumption classification. Status: `bounded` structural and behavioural checks over synthetic data. The checker never imports, loads or executes analyzed, proposed or untrusted code; implementations reach it only as injected probe adapters or observed-result data.
5. Real runner gates (M5): hostile submissions are executed only in fresh dedicated-VM jobs with trusted harnesses. Nothing in this repository establishes that gate; an unavailable runner never triggers host execution or acceptance.
6. Human and independent gates: independent code review of each implementation, operator-configured live-model validation, and human pilot evidence are separate gates and remain open.

## Aggregate composed fit

- Static completeness of a composition is necessary and never sufficient. Aggregate `passed` requires every published check (unit, interface compatibility and end-to-end) to be observed as passed, requires both public and private evaluation evidence, and tolerates no missing, failed, unknown or timed-out result. Unit success alone cannot imply complete fit.
- The client/API mismatch counterexample class: implementations whose unit checks pass locally while the client and server disagree with a published interface are caught by interface/end-to-end obligations and classified `contract_failure` or `integration_failure`; they never aggregate-pass.
- A private integration requirement missing from the published contract is classified as `package_defect` (an incomplete package, eligible for the frozen package-defect terms), not as a contributor failure. The checker reports missing published obligations separately from implementation errors; a broken published composition is also a package-side defect.
- Unknown, malformed or unavailable observed evidence keeps the whole result `unverified`. Unknown verification is never passing verification.

## Bounded ranker

The ranker model and its exhaustive checker cover arrays of length 0..4, IDs `a`..`d` without repetition, all input orders and integer scores 0..2 (2713 valid cases), plus a fixed set of invalid cases: duplicate IDs, non-finite scores, out-of-range or non-integer scores, out-of-alphabet IDs, unscored items, malformed items and non-array inputs, and explicit beyond-bounds inputs. Required model properties: all items returned once in descending score order with ties broken by ascending bytewise ID; input never mutated; deterministic ordering; unscored and beyond-bounds inputs refused explicitly, never ranked with an invented default. Beyond the stated bounds nothing is verified or claimed: the bounded check is not a proof for every possible input, other TypeScript runtime behaviour, or larger inputs recorded by other contracts.

## Caller assumptions

Declared private caller assumptions (item bounds, ID alphabet, score range, input immutability, determinism, unscored handling) are classified `within_bounds`, `out_of_bounds` or `unverifiable` against the registered stated bound sets. Absent or malformed declarations and unknown bound sets are reported as `unverifiable`, never assumed. Behavioural declarations count as verified only after a passing bounded ranker check for the same probe.

## Non-claims

- No semantic confidentiality proof exists anywhere in this system: company approval intentionally releases approved information; canary and deny-pattern checks are review aids only.
- No correctness proof exists: passing bounded checks does not establish preservation, integration or semantic equivalence of generated or contributor code; those remain the isolated-runner gates (M4.3 after M5.2/M5.3).
- Synthetic successes do not establish arbitrary breadth, real-human usefulness, model quality or zero-leak guarantees.
- No report, finding or check result authorizes execution, transfer, release, disclosure, deployment, acceptance or payment; approvals remain owner actions bound to exact revisions.

## Open gates at this revision

Independent review of the M2.x/M3.x implementations, the real dedicated-VM runner, an operator-configured live model, human pilot evidence and the M9 delivery demonstrations all remain open and are reported as not conducted by `doctor` and `verify:mvp`.
