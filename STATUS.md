# Status

Replaced at every wave close. Last written 6 October 2026 by Claude as CTO, at the close of R3.

## Now

- **Accepted on master:** everything through R2, K6 and K8, plus the R3 close-out (reviewed at `c8f8e5a`): every install the product itself starts runs with install scripts disabled, and a small command recorder for research runs.
- **R3's real result: the "useful" milestone is not met.** The product could not prepare a Box for a project outside its own ecosystem. The project surveyed (zod) does not use pnpm, which the product assumes, and none of its open issues had a failing check already in the repository. No Box was made, no recipient ran, nothing was sent to that project. Report: `research/box-delegation/r3/READINESS.md`.
- **Why:** the product's core is tied to one ecosystem in four places: the agreement format (required pnpm, TypeScript and test-runner versions; four allowed tools), file selection (the TypeScript compiler), export (hard-coded pnpm), and generated checks (TypeScript tests).
- **In flight:** nothing.
- **Held:** nothing.

## Approved by the CEO

- 6 Oct 2026: close R3 with the declared-command verb gap accepted (recorded in `waves/R3.md`).
- 6 Oct 2026: **milestone A, a repository-agnostic core**, to be built before any further attempt on an outside repository. Its first wave still shows a pre-cook card and waits for "go".

## Next

No wave starts without a START message and its pre-cook card.

1. **Milestone A: a repository-agnostic core.** The core knows files, commands, exit codes and patches, and nothing else; anything that understands a language or a tool becomes an optional helper. Waves A1 to A4 are in `PLAN.md` and the task graph. `START.md: A1`.
2. **R3 again, as a replay,** after milestone A: recently fixed issues on the code as it was just before each fix, with the maintainers' own test as the check. `START.md: R3b`, not before A closes.

Paused until then: K7, K9 and other kitchen improvements unless one blocks milestone A. D4 waits for the lab's benchmark.

## Night queue

Only for `START.md overnight`, each entry needing naming in that message: A1, A2, A3, A4 in order. R3b is not on the night queue until milestone A has closed.

## Known problems

None blocking. Leftovers are in [BACKLOG.md](BACKLOG.md).

## Decisions waiting for the CEO

- "Go" on the pre-cook card for A1, when you start it.
