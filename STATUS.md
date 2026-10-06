# Status

Replaced at every wave close. A0 closed by Claude on 6 October 2026; A1 kickoff hold recorded by Devin later that day.

## Now

- **Accepted on master:** everything through R2, K6, K8 and the R3 close-out, plus **A0**, the prototype for milestone A (research files only, reviewed at `a6021cc`).
- **The "useful" milestone is not met.** R3 showed the product cannot prepare a Box for a project outside its own ecosystem: its core assumes pnpm, TypeScript and one test runner.
- **A0's result: the neutral design holds, on small projects.** A throwaway loop that knows only files, commands, exit codes and patches prepared, set up, checked and solved a change on an npm project, a Python project and a multi-package repository under both npm and pnpm. 18 trials, 10 worked, reproduced by the reviewer. None of the projects had outside dependencies, and it ran on this one Windows machine.
- **What A0 changed in the plan:** a clean setup is never evidence (a locked install exits 0 with a needed package missing); a check must fail for the right reason, so it is compared with the same check in the full repository; starting a program on Windows needs one fixed rule; outside dependencies get their own test in A4. Detail: `waves/A0.md`, `research/box-delegation/a0/RESULT.md`.
- **In flight:** A1, neutral agreement format and declared-program launch/preflight. Owner replied "go" to the pre-cook card on 6 October 2026, including removal of the old live format. This run stops after A1.
- **Held:** nothing.

## Approved by the CEO

- 6 Oct 2026: close R3 with the declared-command verb gap accepted.
- 6 Oct 2026: milestone A, a repository-agnostic core, before any further attempt on an outside repository; and A0, its prototype, first ("Yes go").

## Next

No wave starts without a START message and its pre-cook card.

1. **A1: a neutral agreement format**, including one rule for starting declared programs and a check that every declared program can be found. Requested with `START.md: A1`; brief in `waves/A1.md`. Milestone A is already approved, but removing the old live format needs the pre-cook "go" under START.md.
2. **A2, A3, A4** follow in order; see `PLAN.md`.
3. **R3b**, a replay of recently fixed issues on a public repository, after milestone A.

Paused until then: K7, K9 and other kitchen improvements unless one blocks milestone A. D4 waits for the lab's benchmark.

## Night queue

Only for `START.md overnight`, each entry needing naming in that message: A1, A2, A3, A4 in order. A4 needs one small download (a well-known package, install scripts disabled); naming A4 approves that. R3b is not on the night queue until milestone A has closed.

## Known problems

None blocking. Leftovers are in [BACKLOG.md](BACKLOG.md).

## Decisions waiting for the CEO

None.
