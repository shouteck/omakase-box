# Pricing guidance for posters (0.4.1, poster friction 8)

## Brief

The 0.4.0 poster rehearsal (PR #41 RC) found friction 8 still open: `omakase-box help` says "at least $1, whole dollars" and `allow --help` defines the limit, but nothing says how to choose the amount. Give a basis for choosing a reward, never an amount: the owner names the amount, never the tool (AGENTS.md; BACKLOG's agent-priced bounties stay out). CLI and repository text only; site pages belong to Omakase Web. Branch off master; PR open, not merged until 0.4.0 ships.

## Plan

- One basis in `wording.ts` (`PRICING_BASIS`, `PRICING_LINE`), stated where the amount is chosen:
  - bare `omakase-box` before setup: the reward question the agent puts to the owner carries the basis and how the limit follows from it;
  - `allow --help`: `--reward` carries the full line — the basis, that only the merged solution is paid so solvers weigh reward against time and other attempts, that a new amount applies to later bounties only, and the limit as reward × bounties open at once;
  - `help`: the reward rule points to `allow --help` (the full line put help 372 characters over its BT17 budget, so it lives with `--reward` instead).
- FIRST-FIVE-MINUTES.md and BOUNTY.md say the same.
- The bundled skill (`SKILL_TEXT`) is left alone: it sends the agent to bare `omakase-box`, which now carries the basis, and PR #41 rewrites those lines. A trial merge onto PR #41 conflicts only in `SKILL_TEXT`'s description, the same conflict master already has with PR #41; these hunks merge cleanly.

## Changed expectations

- tests/box/bounty/bt61-text.test.ts::the journey, command by command — re-recorded with BT61_RECORD=1; the only difference is step 1 (`help`): the reward rule gains "; allow --help says how to choose it". No other step's output changed.
- tests/box/bounty/bt17.test.ts::the posting and collecting journey, command by command — the second draft, close and the reference commands — help's character budget 4500 → 4550 for that 36-character pointer; the guidance itself is in `allow --help`, not help.

## Checks

- tests/box/bounty/poster-pricing.test.ts (new): the line names no dollar amount; help points to `allow --help`; `allow --help` carries the line beside `--reward`; the unset-repository overview carries the basis inside the reward question.

## Result
