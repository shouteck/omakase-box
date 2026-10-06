# Status

Replaced at every wave close. Last written 7 October 2026 by Claude as CTO, after reviewing the overnight run.

## Now

- **Milestone A is delivered: the core is repository-agnostic.** Accepted on master: A1 (neutral agreement format), A2 (owner-listed files, proved by paired checks), A3 (export and verify run only declared commands), A4 (the whole loop on an npm project, a Python project and a multi-package project with one outside dependency, each solved by a recipient given only the folder). All reviewed and test-verified.
- **The "useful" milestone is still not met.** A4's projects were written by the kitchen for the purpose. Nothing has yet been tried on someone else's repository since R3.
- **Off-machine run: green** on the latest master. A4's merge turned it red (a test left the checkout dirty on Linux); two small repair waves, K7-ci and K7-ci2, fixed it overnight with the owner's go.
- **K7 did not run.** It was parked before starting because two instructions conflicted with it, both written by the CTO: overnight rules make the verify script read-only, and the night's one-run limit ruled out K7's five-run measurement. Verification is still about five and a half minutes a run and still about half of each wave.
- **Lab:** one wave behind, below the sync threshold. It has synced twice and done no research since the morning of 6 October.
- **In flight:** nothing. **Held:** nothing.

## Approved by the CEO

- 6 Oct 2026: milestone A; the overnight run of K7, A3 and A4; A4's one small package download.
- 7 Oct 2026, about 03:45: go for the single K7-ci2 correction.

## Next

No wave starts without a START message and its pre-cook card.

1. **K7, in the daytime:** stop the test leaks, run the packaging tests in parallel, make the time budget see every run. Its brief allows up to ten executed full runs for the before-and-after measurement. `START.md: K7`. It edits the verify script, so it cannot run overnight.
2. **R3b:** replay recently fixed issues on a public repository, now that the core can handle any project. This is the next step toward "useful". Not yet approved; `START.md: R3b`.
3. **One real lab session,** since a milestone has closed: `LAB.md` in the lab folder.

Paused: K9 and other kitchen improvements. D4 waits for the lab's benchmark.

## Night queue

Only for `START.md overnight`, entries named in that message. R3b may run overnight once named. K7 may not.

## Known problems

None blocking. Leftovers are in [BACKLOG.md](BACKLOG.md).

## Decisions waiting for the CEO

- Whether to start R3b.
