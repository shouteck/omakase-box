# The kitchen brigade

One structure for every host: Claude Code, Devin, Codex, OpenCode, Cursor or anything else that can read files and start a fresh agent. Nothing here depends on a host's own features. The rules are in [AGENTS.md](../AGENTS.md); the procedure is in [docs/box-v4/KITCHEN.md](../docs/box-v4/KITCHEN.md).

## Who is in the kitchen

| Kitchen | Role | Does | Role file |
|---|---|---|---|
| Owner | CEO (the human) | Sets the menu, approves each milestone | none |
| Head chef | CTO | Writes briefs, dispatches, merges, reports. Never cooks | [roles/cto.md](roles/cto.md) |
| Cook | Worker | Implements one brief on one branch | [roles/worker.md](roles/worker.md) |
| The pass | Reviewer | Checks the cook's exact commit. Reports to the head chef | [roles/reviewer.md](roles/reviewer.md) |
| Blind taster | Recipient | Attempts a change from an exported Box alone | [roles/recipient.md](roles/recipient.md) |

The **research lab** (branch `lab`, its own worktree) is paused by the owner as of 10 October 2026. The kitchen does not read, answer or sync it. Its prototypes are reference reading only; anything the product needs is rebuilt as a reviewed wave.

## Stations

A station is a cuisine: an area of the product with its own knowledge, traps and checks. Each has a one-page card — bounded, today, at 12,288 UTF-8 bytes, enforced by `scripts/kitchen-stats.mjs`. Every brief names one station, and the cook and the reviewer read that card with the brief.

| Station | Covers | Card |
|---|---|---|
| Packaging | Selecting source for a Box, export, clean-directory proof, submit, verify, and the bounty tool's journey | [stations/packaging.md](stations/packaging.md) |
| Evidence | Measurements, comparisons, what may be claimed | [stations/evidence.md](stations/evidence.md) |

A card is knowledge, not a manager. At wave close, the Reflect step adds to the card whatever the next cook on that station would want to have known. Replace stale lines instead of appending; a trap's story stays in the wave file that taught it.

## The shape

**One stove.** Head chef, one cook, the pass. One wave at a time on the main checkout; genuinely parallel writers get separate worktrees, one writer per branch. The retired lead layer and the archived station cards are history (K35): there is no lead role to dispatch and no third level — if parallel capacity is ever needed, that is a new owner decision, not a dormant rule to revive.

## How much gets cooked

The owner's message decides, and the head chef stops when that much is done: `START.md` is one wave, `START.md: <waves>` or `START.md xN` is those, and `START.md overnight` is the night queue with one morning card. Same brigade and the same pass on every route. See [START.md](../START.md).

## How any host staffs a role

1. If the host has named agent profiles for these roles, use them. This repository ships thin ones for Claude Code (`.claude/agents/`) and Devin (`.devin/agents/`); they only point at the role files here.
2. Otherwise start a fresh agent and give it, as its whole prompt: the role file, the wave file, the station card, and the commit SHA if it is the reviewer. Codex, OpenCode and Cursor work this way.
3. The recipient is the exception: it must not see this repository, so paste the text of `roles/recipient.md` into its prompt and give it only the Box folder.

A fresh agent never inherits the head chef's conversation. If it is not in the files you hand over, the agent does not know it. Record which host and model filled each role in the wave file.
