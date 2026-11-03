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

## Plan

Written by the CTO at kickoff, 4 November 2026.

- **The stated reward (owner, 4 November 2026: "you can run the 9b, its fake money right"):** seats 7 and 8 run on a sandbox bounty stating $5, its task saying "test bounty; solved by the project's own agents; no money moves". No money moves anywhere: seats 7 and 8 are records on the board, seat 11 is tests only. A "paid" recorded in the test is withdrawn before the wave closes.
- **Built first (done):** the board never lists a repository its own setting names (`UNLISTED_REPOSITORIES`, the sandbox), through the one gate every listing passes (`readRepository`), plus a purge at each run and a refusal at render; three tests, each guard broken once. Seat 11: a dispute's webhook and a solver's disconnect, two tests, each guard broken once.
- **Then seats 7 and 8 live, before the setting is deployed** (it would hide their bounty): a $5 sandbox bounty, a solution merged with the tool, then seat 7 (the owner: "whom do I owe, record it") and seat 8 (the solver, signed in: confirm or dispute). The browser pane has no GitHub session and the CTO enters no password, so the owner signs in to GitHub there once.
- **One account:** poster and solver are the same login, so the merge is self-dealt and left out of the owner's record; whether the board lets that one login both record and confirm is what the seats find, and the Result names it.
- **Then deploy (owner's word):** the setting goes live; the live feed, pages, numbers, MCP and owner records are each checked for no sandbox bounty; `exceededCpu` before and after.
