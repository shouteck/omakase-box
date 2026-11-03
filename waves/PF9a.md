# PF9a: every agent flow, for real, by fresh agents

Milestone: PF (the platform) · Station: evidence · Base: `master at dispatch` · Branch: `wave/PF9a` · Timebox: 300 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-04-pf9-split, D-2026-11-01-real-before-launch, D-2026-10-19-k31-sandbox-go, D-2026-11-04-complete-before-launch
Horizon: long: start with a plan in this file

**Brief.** Written by the CTO on 4 November 2026, splitting [PF9](PF9.md) on the owner's word: PF9a runs every agent flow; [PF9b](PF9b.md) runs the money seats and the clean board. PF9's rules stand: each seat is a fresh session in a scratch folder with its own settings, given only its goal and its material; no seat passes from a report alone; blockers are fixed in the wave (small) or brought to the owner (large). The table below is PF9's, updated for PF22 to PF29.

## Outcome

Every agent flow of the product has run on real GitHub and the live board, by fresh agents, and every blocker they hit is fixed or named to the owner. `kitchen/reviews/PF9-flows.md` holds the table: seat, prompt, what happened, verbatim.

## The seats

| # | Seat | Given only | Goal | Must end with |
|---|---|---|---|---|
| 1 | Stranger owner | The live front page | "Set this up so your agent can hand off work" | Installed from the packed tarball (not yet on npm), the sandbox allowed, instructions switched on |
| 2 | Agent told to hand off | The instruction block and a task | Post it | A real issue on the sandbox, listed on the board within minutes |
| 3 | Solver, web | The board's address, signed in with GitHub in the built-in browser (owner, 4 November 2026) | Find a bounty and answer | A real pull request |
| 4 | Solver agent, MCP | Only the MCP address | Is this board worth checking, and is a bounty worth taking? Then answer | Its judgement from `get_numbers` and `get_bounty`, and a real pull request |
| 4b | Solver agent, the tool | The installed tool, solving allowed, "you need income this week", the owner's trial word given up front (PF27's lesson) | `discover`, `take`, `submit`, follow it | A draft that became a merged pull request; `status` showing the payment step; the checks on its attempt read |
| 4c | Owner, solving switch | The tool and its settings | Allow solving with a reward floor; then turn it off | `discover` honours the floor; with solving off, `take` refuses and nothing reaches the board |
| 5 | Agent with solutions waiting | The same clone, a new session | Choose one, after asking for a change | Merged on real GitHub, the changed version (PF27's fix) |
| 6 | Later agent, other machine | A fresh clone | Continue what is in flight | Sees, reads and finishes it |
| 9 | Owner, stopping | The tool and the site | Stop agents posting here; close one | `deny` holds; a bounty closes; nothing left open |
| 10 | Refusals | A task with a token, a private repository, a never-ship path | Try to post | Each held or refused with a true next step; nothing goes out |

Sandbox bounties state **$5** with the task saying "test bounty; solved by the project's own agents; no money moves" (PF9's approval). No real money moves. Seats run in dependency order: 1, 4c and 10 alone; 2 posts what 3, 4 and 4b answer; 5 and 6 follow.

## Done when

- `node scripts/verify.mjs test:box-bounty test:platform test:kitchen` exits 0 on the final commit.
- Every seat ran, or the Result says which did not and why; each result backed by GitHub, the board or the logs. One GitHub account: where the payee must differ from the poster, or a fork is needed, the seat names the stand-in test that proves it.
- Open **blocks** and **misleads**: zero, or each named to the owner with one recommendation.
- Sandbox issues and pull requests closed, scratch removed.

## Lenses

- [x] **User experience:** this wave is the lens; hesitations and wrong guesses verbatim.
- [x] **Measurement fairness:** each seat had only its material (prompts in the report); a test agent is not a user; nothing is reported as customer evidence.
- [ ] **Security:** seat 10.
