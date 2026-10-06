# request-to-check/01: would a cheap check have judged R1 as well as its custom check did?

Line: request-to-check · Date: 6 October 2026 · Rerun with: `node lab/lines/request-to-check/experiments/01-r1-cheap-check/run.mjs` (needs `node scripts/pnpm.mjs install --frozen-lockfile` once in the lab folder)

Everything above the rule is written before anything is run.

## Claim under test

For R1 (remove the "Usage per wave" output from `scripts/kitchen-stats.mjs`, keep everything else), a check made of what the repository already had plus one command gives the same accept/reject verdicts as the custom check R1 wrote. If so, most of R1's preparation cost bought nothing a reviewer could observe, which is R2's premise.

Builds on the field's fail-to-pass plus pass-to-pass shape (SWE-bench) and on the survey's lead from the Git record. It could be wrong: the existing test may not exercise the printed page closely enough to notice damage.

## Design

- **Compared:**
  - **Check A (custom, what R1 used):** `tests/kitchen/kitchen-stats-no-usage.test.ts` as merged at `ddeb3ab`, 83 lines. (R1 also wrote about 320 lines of generator, owner-check and packaging tests around it; those deliver this same test into the Box and the owner run, and are not separate judgements.)
  - **Check B (cheap):** B1, `tests/kitchen/kitchen-stats.test.ts` exactly as it stood at R1's base `e412e08`, before R1 existed, 193 lines, zero new lines; and B2, one new command: run `node scripts/kitchen-stats.mjs` and fail if the output matches `usage`, any case. B accepts only if both pass.
- **Held equal:** the same candidate file, the same surrounding repository (the lab worktree), the same Node and vitest.
- **Cases:** eight candidate versions of the script. Development cases, all written by the lab lead who also knows both checks, so this is not held-out.
  - C0 no change (R1's base). Wrong.
  - C1 the change R1 accepted (`ddeb3ab`). Right.
  - C2 empty file. Wrong.
  - C3 section kept but reworded so the word "usage" never prints ("Tokens per wave"). Wrong.
  - C4 right change, but `checkLimits` is no longer exported. Wrong.
  - C5 right output, but the unused Usage parsing is left in. Wrong by the request's wording; not observable from outside.
  - C6 right change, but the "Largest costs" heading is also deleted. Wrong (over-deletion, the classic failure of automated repair).
  - C7 right change, but one "missing" label is replaced by "0". Wrong.
- **Runs:** one per candidate per check. The checks are deterministic; a second full pass is run only to confirm that.

## Predictions, written first

| Case | A | B |
|---|---|---|
| C0 | reject | reject |
| C1 | accept | accept |
| C2 | reject | reject |
| C3 | accept (wrongly) | accept (wrongly) |
| C4 | reject | reject |
| C5 | accept | accept |
| C6 | reject | accept (wrongly) |
| C7 | accept (wrongly) | accept (wrongly) |

## What each outcome would mean

- **Supports the claim:** B's verdict equals A's on every case, or B is stricter.
- **Partly supports:** B is right on C0, C1 and C2 but misses a case A catches. Then the lines R1 wrote bought exactly those cases, and the count of lines needed to close the gap is the honest price.
- **Refutes it:** B accepts C0 or C2, or rejects C1.
- **Tells us nothing:** the old test cannot run in the current tree for unrelated reasons.

Whatever happens, eight hand-made cases on one request say nothing about rates.

## Cost and coordination

Zero-cost check: Node, pnpm and vitest already pinned by the repository; nothing paid. Heavy jobs: one frozen install in the lab folder and sixteen short vitest runs, after `node lab/tools/kitchen-busy.mjs` says idle. The runner swaps `scripts/kitchen-stats.mjs` in the lab worktree and restores it from Git when it finishes or fails.

---
