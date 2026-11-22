# Pricing guidance for posters (0.4.1, poster friction 8)

## Brief

The 0.4.0 poster rehearsal (PR #41 RC) found friction 8 still open: `omakase-box help` says "at least $1, whole dollars" and `allow --help` defines the limit, but nothing says how to choose the amount. Give a basis for choosing a reward, never an amount: the owner names the amount, never the tool (AGENTS.md; BACKLOG's agent-priced bounties stay out). CLI and repository text only; site pages belong to Omakase Web. Branch off master; PR open, not merged until 0.4.0 ships.

## Plan

- One basis in `wording.ts` (`PRICING_BASIS`, `PRICING_LINE`), stated in three places:
  - bare `omakase-box` before setup: the reward question the agent puts to the owner carries the basis and how the limit follows from it;
  - `help`: a full line after the reward rule — the basis, that only the merged solution is paid so solvers weigh reward against time and other attempts, that a new amount applies to later bounties only, and the limit as reward × bounties open at once;
  - `allow --help`: `--reward` points to `help`.
- FIRST-FIVE-MINUTES.md and BOUNTY.md say the same.
- The bundled skill (`SKILL_TEXT`) is left alone: it sends the agent to bare `omakase-box`, which now carries the basis, and PR #41 rewrites those lines (no conflict on merge).

## Changed expectations

- tests/box/bounty/bt61-text.test.ts::the journey, command by command — re-recorded with BT61_RECORD=1; the only difference is step 1 (`help`) gaining the new pricing line. No other step's output changed.

## Checks

- tests/box/bounty/poster-pricing.test.ts (new): help carries the line and names no dollar amount; the unset-repository overview carries the basis inside the reward question; `allow --help` points from `--reward` to help.

## Result
