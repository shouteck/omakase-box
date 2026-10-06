# Status

Replaced at wave close. Last written 6 October 2026 by Claude as CTO, after reviewing the A2 run.

## Now

- **Accepted on master:** R2, K6, K8, R3 close-out, A0, A1 and **A2**. Independent A2 reviewer PASS on `2f64a31`; its completed fresh verification passed all 129 packaging tests. Detail: `waves/A2.md`.
- **Delivered by A2:** explicit extension-neutral file selection; TypeScript traversal only proposes files; selected dependency files copied unchanged with provenance; declared recipient checks paired between the full untouched base and isolated Box. Different result, exit or full normalized output digest refuses export.
- **Comparison limits:** hashes cover UTF-8-decoded text per stream, framed as a JSON tuple, not raw output bytes or proof of failure causality. Bounded log tails are presentation only. No runnable recipient checks means an unproven-selection warning, not readiness evidence.
- **Still pending:** A3 removes product-owned pnpm/compile orchestration and generated TypeScript scaffolding. A4 proves npm/Python delegation with blind recipients and outside dependencies. The useful milestone remains unmet.
- **In flight:** nothing. This run stops after A2.
- **Held:** nothing. The merged `wave/A2` branch was deleted on the owner's instruction; from now on a close is never held for a branch (KITCHEN.md, close step).
- **Verification is slowing the kitchen:** about half of A1 (32 of 70 minutes) and A2 (38 of 71). The packaging suite has grown from about 30 seconds to three to four minutes and runs its files one at a time. K7 is un-paused to fix that, and from now on each candidate gets one executed full run, not two.
- **Lab:** its brief was replaced after session 4, before A2 closed, so it is one wave behind. It has not seen A2's result. Its advice on A2 (compare failure output, not only pass or fail) matches what A2's reviewer found independently.

## Approved by the CEO

- 6 Oct 2026: R3 close-out; milestone A and its A0 prototype.
- 6 Oct 2026: A1 and its old live format removal; A1 branch deleted by owner confirmation. KITCHEN.md records standing approval for fully merged branch deletion.
- 6 Oct 2026: `START.MD A2`, pre-cook card presented for continuation without existing-file deletion.

## Next

No wave starts without a START message and its pre-cook card.

1. **K7:** run the packaging tests in parallel and make the time budget see every run. `START.md: K7`. Un-paused by the CTO because verification now takes half of each wave.
2. **A3: neutral export and owner verify**, declared setup/checks without core package-manager knowledge or generated TypeScript scaffolding. `START.md: A3`.
3. **A4**, then **R3b**, follow in order; see `PLAN.md`.

K9 and other kitchen improvements stay paused unless blocking milestone A. D4 awaits the lab's benchmark.

## Night queue

Only for `START.md overnight`, with entries named in that message: K7, A3, A4 in order. If K7 is parked, carry on with A3. Naming A4 approves its small well-known package download with install scripts disabled. R3b is not queued before milestone A closes.

## Known problems

No blocking product defect known. Non-blocking limits and leftovers are in `BACKLOG.md`.

## Decisions waiting for the CEO

None.
