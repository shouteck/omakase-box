# PF9b: the money seats, and a clean board for launch

Milestone: PF (the platform) · Station: evidence · Base: `master at dispatch` · Branch: `wave/PF9b` · Timebox: 240 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-04-pf9-split, D-2026-11-01-pay-on-merge, D-2026-11-01-real-before-launch
Horizon: long: start with a plan in this file

**Brief.** Written by the CTO on 4 November 2026, the second half of [PF9](PF9.md), after [PF9a](PF9a.md). PF9's rules stand.

## Outcome

The money flows have run for real where they can at $0 and are test-proven where they cannot, and the public board shows none of the kitchen's test activity, now or after launch.

## Build and seats

1. **The board never lists the sandbox** (owner, 4 November 2026). A board setting names repositories the board does not list, in the feed, the pages, the numbers, MCP and its owner records; the sandbox is on it. Tests keep running there after launch without showing as activity. The Result proves the live board shows none of it.
2. **Seat 7, owner money:** given the pay message and the board, "whom do I owe, record it". Owed names the right person; recorded paid shows. A "paid" recorded in the test is withdrawn before the wave closes, since it would be a false fact.
3. **Seat 8, solver money:** the bounty page, signed in with GitHub in the built-in browser (owner, 4 November 2026); confirm or dispute. Both words shown, attributed.
4. **Seat 11, pay on merge:** test-proven, plus PF11's real test-mode run (owner, 4 November 2026). Add the two cases PF11 did not prove: a solver disconnecting Stripe, and a dispute's webhook, each with a test that fails when its guard is broken.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit.
- The live board lists nothing from the sandbox: feed, pages, numbers, MCP and owner records, each checked.
- Seats 7 and 8 ran on the live board; seat 11's two new cases each fail when broken.
- Deploy on the owner's word; `exceededCpu` before and after.

## Lenses

- [x] **Measurement fairness:** the numbers and records exclude the sandbox; nothing from a test reads as real use.
- [x] **Security:** the exclusion cannot be used to hide a real repository's bounties from the public by anyone but the board's owner.
