# Status

Replaced by the CTO on 10 October 2026, at the close of wave C1.

## Now

- **C1 is done and merged** (`ad7c1a6`, PASS ui-verified): `box trace --out <dir> -- <test command>` records every repository function a failing Python test ran — identified by file and def-line, child processes included — into a documented `trace.json`, without disturbing the test. New suite `test:box-trace`; docs in `docs/box-v4/BOX-TRACE.md`.
- **Milestone C is approved** (C1 to C5). Each wave cooks only when the owner names it, and the kitchen stops after each. C5, the first Box posted outside, needs a separate approval.
- **Known C1 limits for C2:** a child still running at command exit is silently absent from `processes`; cross-process `order` is per-process, not wall-clock; the hook dir must stay outside the traced root; no `box` binary — invoke `node packages/box-cli/dist/cli.js`.
- **The lab is paused entirely.** Do not read its brief, answer it or run a sync.
- **Left as they are, not merged and not deleted:** local branches `wave/A6` and `wave/K7` (parked). Deleting an unmerged branch is the owner's call.

## Next

**C2: from a failing test to a ready Box with nothing written by hand.** One command traces, chooses files, applies the never-ship list, writes the agreement, exports and prints the owner's summary. No brief yet — the CTO writes it when this wave is named. Send `START.md: C2`.
