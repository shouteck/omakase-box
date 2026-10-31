# The kitchen

One structure for every host: Claude Code, Devin, Codex, OpenCode, Cursor or anything else that can read and write files. Nothing here depends on a host's own features. The rules are in [AGENTS.md](../AGENTS.md); the procedure is in [docs/box-v4/KITCHEN.md](../docs/box-v4/KITCHEN.md).

## Who is in the kitchen

| Kitchen | Role | Does | Role file |
|---|---|---|---|
| Owner | CEO (the human) | Sets the menu, approves each milestone | none |
| Head chef | CTO | The fresh session the owner talks to. Writes the brief, carries out the wave, merges, reports | [roles/cto.md](roles/cto.md) |
| Blind taster | Recipient | Attempts a change from an exported Box alone | [roles/recipient.md](roles/recipient.md) |

There is no cook and no reviewer (owner, 31 October 2026, D-2026-10-31-cto-carries-waves).

The **research lab** (branch `lab`, its own worktree) is paused by the owner as of 10 October 2026. The kitchen does not read, answer or sync it. Its prototypes are reference reading only; anything the product needs is rebuilt as a normal wave.

## Stations

A station is a cuisine: an area of the product with its own knowledge, traps and checks. Each has a one-page card — bounded, today, at 12,288 UTF-8 bytes, enforced by `scripts/kitchen-stats.mjs`. Every brief names one station, and the CTO reads that card with the brief.

| Station | Covers | Card |
|---|---|---|
| Packaging | Selecting source for a Box, export, clean-directory proof, submit, verify, and the bounty tool's journey | [stations/packaging.md](stations/packaging.md) |
| Evidence | Measurements, comparisons, what may be claimed | [stations/evidence.md](stations/evidence.md) |

A card is knowledge, not a manager. At wave close, the Reflect step adds to the card whatever the next session on that station would want to have known. Replace stale lines instead of appending; a trap's story stays in the wave file that taught it.

## The shape

**One CTO per wave.** One wave at a time on the main checkout; parallel waves are separate sessions in separate worktrees, one writer per branch. A long wave, by clock or by concept, starts with `/plan`, and the plan lives in the wave file so a later session can resume.

## How much gets cooked

The owner's message decides, and the head chef stops when that much is done: `START.md` is one wave, `START.md: <waves>` or `START.md xN` is those, and `START.md overnight` is the night queue with one morning card. The same process on every route. See [START.md](../START.md).

## On any host

1. A fresh session reads `AGENTS.md`, `STATUS.md`, `kitchen/roles/cto.md` and the wave file, then carries out the wave. Thin host files exist only to point there: `.claude/skills/kitchen/`, `.devin/rules/`.
2. On a host without `/plan`, the session writes the wave file's `## Plan` section itself before starting a long wave.
3. Participants in a fresh-agent check are fresh sessions in scratch folders, never subagents. The recipient must not see this repository, so paste the text of `roles/recipient.md` into its prompt and give it only the Box folder.

Record the host and model in the wave file. Fable only on the owner's word.
