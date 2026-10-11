# The kitchen brigade

One structure for every host: Claude Code, Devin, Codex, OpenCode, Cursor or anything else that can read files and start a fresh agent. Nothing here depends on a host's own features. The rules are in [AGENTS.md](../AGENTS.md); the procedure is in [docs/box-v4/KITCHEN.md](../docs/box-v4/KITCHEN.md).

## Who is in the kitchen

| Kitchen | Role | Does | Role file |
|---|---|---|---|
| Owner | CEO (the human) | Sets the menu, approves each milestone | none |
| Head chef | CTO | Writes briefs, dispatches, merges, reports. Never cooks | [roles/cto.md](roles/cto.md) |
| Station chef | Lead of one station | Runs several cooks on one station. Only after promotion, see below | [roles/station-chef.md](roles/station-chef.md) |
| Cook | Worker | Implements one brief on one branch | [roles/worker.md](roles/worker.md) |
| The pass | Reviewer | Checks the cook's exact commit. Reports to the head chef, never to a station | [roles/reviewer.md](roles/reviewer.md) |
| Blind taster | Recipient | Attempts a change from an exported Box alone | [roles/recipient.md](roles/recipient.md) |

The **research lab** (branch `lab`, its own worktree) is paused by the owner as of 10 October 2026. The kitchen does not read, answer or sync it. Its prototypes are reference reading only; anything the product needs is rebuilt as a reviewed wave.

## Stations

A station is a cuisine: an area of the product with its own knowledge, traps and checks. Each has a one-page card. Every brief names one station, and the cook and the reviewer read that card with the brief.

| Station | Covers | Card |
|---|---|---|
| Packaging | Selecting source for a Box, export, clean-directory proof, submit, verify | [stations/packaging.md](stations/packaging.md) |
| Service and data | The API, the Box store, migrations, auth | [stations/service-data.md](stations/service-data.md) |
| Console | The screens, and whether a person understands them | [stations/console.md](stations/console.md) |
| Evidence | Measurements, comparisons, what may be claimed | [stations/evidence.md](stations/evidence.md) |

A card is knowledge, not a manager. At wave close, the Reflect step adds to the card whatever the next cook on that station would want to have known. Keep each card to one page; replace stale lines instead of appending.

## The shape, and when it grows

**Today: one stove.** Head chef, one cook, the pass. One wave at a time. Stations exist as cards only.

**Promote a station to a station chef when either is true:**

- two waves on different stations can really run at the same time, which needs more capacity than one machine running one heavy job (more capacity is the owner's decision); or
- the head chef has more waves in flight than it can track, roughly more than ten.

Then the shape is head chef, a station chef per busy station, and cooks under each. Three levels, never more. The station chef writes its cooks' briefs and reports one rollup per wave, not raw cook reports. The pass stays with the head chef so that no station checks its own plates. When the station goes quiet, the station chef goes away and the card remains.

Do not add a station chef to manage a single cook. Each layer re-reads the whole context and loses detail in the relay.

## How much gets cooked

The owner's message decides, and the head chef stops when that much is done: `START.md` is one wave, `START.md: <waves>` or `START.md xN` is those, and `START.md overnight` is the night queue with one morning card. Same brigade and the same pass on every route. See [START.md](../START.md).

## How any host staffs a role

1. If the host has named agent profiles for these roles, use them. This repository ships thin ones for Claude Code (`.claude/agents/`) and Devin (`.devin/agents/`); they only point at the role files here.
2. Otherwise start a fresh agent and give it, as its whole prompt: the role file, the wave file, the station card, and the commit SHA if it is the reviewer. Codex, OpenCode and Cursor work this way.
3. The recipient is the exception: it must not see this repository, so paste the text of `roles/recipient.md` into its prompt and give it only the Box folder.

A fresh agent never inherits the head chef's conversation. If it is not in the files you hand over, the agent does not know it. Record which host and model filled each role in the wave file.
