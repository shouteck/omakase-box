# The kitchen

One structure for every host: Claude Code, Devin, Codex, OpenCode, Cursor or anything else that can read and write files. Nothing here depends on a host's own features. The rules are in [AGENTS.md](../AGENTS.md); the procedure is in [docs/box-v4/KITCHEN.md](../docs/box-v4/KITCHEN.md).

## Who is in the kitchen

| Kitchen | Role | Does | Role file |
|---|---|---|---|
| Owner | CEO (the human) | Sets the menu, approves each milestone | none |
| Coordinator | D3vin | The owner's main contact. Refines and decides each wave with the owner, keeps order, splits work by area, delegates, sequences, integrates, reports. Writes no code | none |
| Area bot | Safety, Records, CLI, BoardUI, BoardAPI, Payments or Quality | Carries out its delegated wave part and proves the work | [roles/cto.md](roles/cto.md) |
| Blind taster | Recipient | Attempts a change from an exported Box alone | [roles/recipient.md](roles/recipient.md) |

There is no cook, reviewer or chef role (owner, 26 November 2026, D-2026-11-26-area-team).

The **research lab** (branch `lab`, its own worktree) is paused by the owner as of 10 October 2026. The kitchen does not read, answer or sync it. Its prototypes are reference reading only; anything the product needs is rebuilt as a normal wave.

## Stations

A station is a cuisine: an area of the product with its own knowledge, traps and checks. Each has a one-page card — bounded, today, at 12,288 UTF-8 bytes, enforced by `scripts/kitchen-stats.mjs`. Every brief names one station, and the bot carrying the work reads that card with the brief.

| Station | Covers | Card |
|---|---|---|
| Packaging | Selecting source for a Box, export, clean-directory proof, submit, verify, and the bounty tool's journey | [stations/packaging.md](stations/packaging.md) |
| Evidence | Measurements, comparisons, what may be claimed | [stations/evidence.md](stations/evidence.md) |

A card is knowledge, not a manager. At wave close, the Reflect step adds to the card whatever the next session on that station would want to have known. Replace stale lines instead of appending; a trap's story stays in the wave file that taught it.

## The shape

**One writer per branch.** D3vin decides whether a wave is serial or split across areas; when it spans areas, D3vin names the wave-branch writer and when. Each area bot works in its own Orca worktree, never the main checkout. A long wave, by clock or by concept, starts with `/plan`, and the plan lives in the wave file so a later session can resume.

## How much gets cooked

The owner's message decides, and D3vin stops the run when that much is done: `START.md` is one wave, `START.md: <waves>` or `START.md xN` is those, and `START.md overnight` is the night queue with one morning card. The same process on every route. See [START.md](../START.md).

## On any host

1. The bot carrying work reads `AGENTS.md`, `STATUS.md`, `kitchen/roles/cto.md`, the wave file and D3vin's assignment, then carries out that wave or part. Thin host files exist only to point there: `.claude/skills/kitchen/`, `.devin/rules/`.
2. On a host without `/plan`, the session writes the wave file's `## Plan` section itself before starting a long wave.
3. Participants in a fresh-agent check are fresh sessions in scratch folders, never subagents. The recipient must not see this repository, so paste the text of `roles/recipient.md` into its prompt and give it only the Box folder.

Record the host and model in the wave file. Fable only on the owner's word.
