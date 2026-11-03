# PF9: every flow, for real, by fresh agents

Milestone: PF (the platform) · Station: evidence · Base: `master at dispatch` · Branch: `wave/PF9` · Timebox: 300 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-01-real-before-launch, D-2026-10-19-k31-sandbox-go, D-2026-11-01-pay-on-merge, D-2026-11-01-film-and-launch-last
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written by the CTO on 1 November 2026. **The launch gate. Runs after PF27** (updated 3 November 2026: PF12 was retired into PF22 to PF27, so the solver side is now the tool's own journey). Owner: making sure the product's functionality is fully covered matters more than further engineering. Nothing launches until this passes.

## Outcome

Every flow of the product has been run on real GitHub and the live board by fresh agents given only what that user would have, and every blocker they hit is fixed or named to the owner. `kitchen/reviews/PF9-flows.md` holds the table: flow, who ran it, what happened, verbatim.

## The flows

Each seat is a fresh session in a scratch folder, never a subagent, with its own settings folder. Each gets only its goal and its material.

| # | Seat | Given only | Goal | Must end with |
|---|---|---|---|---|
| 1 | Stranger owner | The live front page | "Set this up so your agent can hand off work" | Installed from the packed tarball (not yet on npm), one repository allowed, note switched on |
| 2 | Agent told to hand off | The instruction block and a task | Post it | A real issue on the sandbox, listed on the board within minutes |
| 3 | Solver, web | The board's address | Find a bounty and answer | A real pull request |
| 4 | Solver agent, MCP | Only the MCP address | Find a bounty worth taking, then answer | A real pull request |
| 4b | Solver agent, the tool | The installed tool, solving allowed by the owner, "you need income this week" | `discover`, `take`, `submit`, then follow it | A draft that became a merged pull request, from a fork, and `status` showing paid or the one link to connect payment |
| 4c | Owner, solving switch | The tool and its settings | Allow solving with a reward floor; then turn it off | `discover` honours the floor; with solving off, `take` refuses and nothing reaches the board |
| 5 | Agent with solutions waiting | The same clone, a new session | Choose one | Merged on real GitHub; `MERGED` on the pull request |
| 6 | Later agent, other machine | A fresh clone | Continue what is in flight | Sees, reads and finishes it (BT52) |
| 7 | Owner, money | The pay message and the board | Whom do I owe, record it | Owed names the right person; recorded paid shows |
| 8 | Solver, money | The bounty page, signed in | Confirm or dispute | Both words shown, attributed |
| 9 | Owner, stopping | The tool and the site | Stop agents posting here; close one | `deny` holds; a bounty closes; nothing is left open |
| 10 | Refusals | A task with a token, a private repository, a never-ship path | Try to post | Each held or refused with a true next step; nothing goes out |
| 11 | Pay on merge | Stripe's test mode, a test card and a connected test solver | Save a card on Stripe's page in a real browser, turn it on and merge a solution | The test solver is paid in test mode, the board shows it, and a duplicate does not charge twice. PF11 did not prove a solver's disconnect or a dispute's webhook: run both here |

Add a flow if the plan finds one PLAN.md's stages name and this table misses.

## Rewards in the sandbox

Seats 7 and 8 need a stated reward. The owner approves this wave with a **$5 stated reward on sandbox bounties**, with the task saying "test bounty; solved by the project's own agents; no money moves". **No real money moves.** Seat 11 uses only Stripe's test mode and test cards. A "paid" recorded in the test is withdrawn before the wave closes, because it would be a false fact.

## Before launch: a clean board

Anything the test leaves must not look like activity on launch day. The sandbox's records are excluded from the public board or cleared, and the Result proves the live board shows none of them. Nothing here may be presented as real use.

## How blockers are handled

- **Blocks** (a seat could not reach its goal) or **misleads** (it reached a wrong belief): fix in this wave if small, on the branch with tests, and rerun that seat fresh. If larger: stop and bring the owner one recommendation.
- **Slows:** record it; fix if cheap; otherwise BACKLOG.
- Two reruns of a seat with no new information: stop.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit, with heavy apps closed.
- All thirteen seats ran, or the Result says which did not and why. Seat 4b's fork and payee need a second GitHub account (PF27); if the owner has not made one, the Result says what ran on one account. No seat is marked passed from a report alone: GitHub, the board and the logs back it.
- Open **blocks** and **misleads** findings: zero, or each named to the owner with one recommendation.
- Sandbox issues and pull requests closed, scratch removed, the live board clean.

## Lenses

- [ ] **Security:** covered by seat 10.
- [x] **User experience:** this wave is the lens. Hesitations and wrong guesses are recorded verbatim.
- [x] **Measurement fairness:** each seat had only its material (the prompts are in the report); nothing is reported as customer evidence; a test agent is not a user.

## Notes

- Investigation playbook, bug-fix for what it finds; principles: prove-it-works.
- Seats are test subjects; the CTO runs them and checks the results itself. Fresh sessions may need the owner's turn to start, per the kitchen's participants note.
- These agents are told to hand off, so this does not measure whether agents choose to, and today's sessions are no verdict on that (D-2026-11-01-agent-only-direction).

---

## Result

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: <what was tried and what was found>
- Method: <playbook; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<line from node scripts/kitchen-stats.mjs --wave=PF9>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong> -> <wave | station | kitchen>: <what it became, or "nothing">
