# Station: Evidence

Measurements, comparisons and what the kitchen is allowed to claim. Runs through every milestone. In milestone C it owns the record of each real hand-off (C4, C5): every manual step, what left the machine, and what the solver could see.

## What this station knows

- The plan is `docs/box-v4/delegation/VALIDATION-PLAN.md`. The question is whether a Box costs the owner less total effort than ordinary delegation, or discloses far less source for similar effort, and whether anyone chooses it again.
- Record for every attempt: owner preparation, recipient onboarding, implementation, owner acceptance, elapsed time, and quality. From D2 on also record the share of owner source disclosed, and for agent recipients the same agent with the Box and with the full repository: success, tokens, time, owner interventions.
- Four conclusions are always reported separately: software capability, measured effort, actual repeat use, commercial commitment. A good result in one says nothing about the next.
- The kitchen's own waves delivered as Boxes are real repeat use by one team. Label them internal; they are not customer evidence.

## Traps

- **Every attempt counts.** Failures, abandoned runs and unsupported requests stay in the denominator.
- **Missing is not zero.** An observation nobody recorded is reported as missing. Code/syscall inference about a Linux failure is not a Linux-observed reproduction; distinguish local acceptance from hosted confirmation.
- **A number without its story is not evidence.** Name run count, spread and limits; one run is an anecdote. For disclosure, distinguish tracked-file and filesystem inventories, list exclusions, and exclude worktree metadata: R1's live 1834-file denominator was only 694 tracked non-excluded files.
- **Unequal sides.** Both routes must carry the same outcome and the same acceptance checks. Differences in access are the thing being tested and are stated, not hidden.
- **A blind taster on this machine is not blind by force.** The recipient is told not to look outside the Box folder, but nothing stops it. Say so with every result, and for results that matter run the recipient where the repository is not present.
- **An agent is not a human participant**, interest is not demand, and a trial is not revenue.
- **No agent contacts anyone.** Customer conversations are the owner's.

## The pass checks

- Tick the measurement-fairness lens for any wave on this station.
- Recount the denominator from the raw records, not from the summary.
- Re-run at least one measured attempt from a clean directory and compare.
- Read each claim in the report and find the record that supports it; strike any that has none.
