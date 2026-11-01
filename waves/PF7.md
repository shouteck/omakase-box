# PF7: the front page shows how it works, step by step

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF7` · Timebox: 300 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-11-01-real-before-launch, D-2026-10-21-minimalism, D-2026-10-22-k43-decisions, D-2026-10-21-k44-decisions
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written by the CTO on 1 November 2026, from the owner: the front page should have intuitive, illustrated steps of how to run the flow, and it should be beautiful. **Stops once for the owner's eye** (below). Also adds the "you owe" list the owner's page still lacks.

## Why

`/` is the board today: a stranger lands on a list with no idea what the product is or how to start. `/how/` has the words but no picture of the flow, and is one click away. K44's clearest line was the mechanism: the task goes out as a GitHub issue, solutions come back as pull requests.

## Outcome

A stranger, person or agent, opens the front page and within a minute can say what the tool does, what becomes public, and the exact first command, for either side, from illustrated steps that are a pleasure to look at. The board is one click away, and the newest bounties show on the front page.

## The page

1. **First screen:** the one-sentence mechanism, large; one illustration; one action: "See the steps" or the install line.
2. **Hand off work, the owner and agent path,** one illustrated step each:
   1. Install, and allow one repository: the real commands.
   2. Your agent packs the task: `box bounty create`.
   3. It goes out as a GitHub issue on your own public repository: `box bounty post`. Say here what becomes public and that nothing private can go.
   4. Solutions come back as pull requests: `status`, `look`. Nothing a solver wrote is run.
   5. Your agent picks one and merges: `apply`. You push.
   6. You pay the solver directly and record it. The board carries no money.
3. **Answer bounties, the solver path,** three steps: find one (board, feed or MCP); open a pull request against its branch; get merged, get paid by the owner, confirm receipt.
4. **Newest bounties:** a few K43 cards and "See all". The full board moves to `/board/`; `/` no longer lists every bounty. Feed, MCP and RSS addresses do not change.
5. **For agents:** one quiet line pointing at the MCP address and the feed.

## The illustrations and the look

- **One visual language, shared with K41's film:** the bounty is a small folded paper parcel tied with string, travelling one dotted path out and back. Every step uses the parcel or the path. Drawn as inline SVG in ink with a slight hand wobble, in the code, so no stock art and no image downloads.
- **K43's rules hold** (PLATFORM-UX.md section 7.2): Inter in two weights and four sizes, paper `#f5f2ea`, ink `#1d1b17`, one accent `#234a7d`, generous space, no shadows, gradients, badges or decorative icons, one primary action. Light, dark and phone widths; WCAG 2.2 AA; every illustration has a text alternative, and the steps read fully without it.
- **Motion:** K43 says none. One exception may be proposed at the stop: the dotted path draws itself once on load, off under `prefers-reduced-motion`.
- **Never** Claude's, Apple's, Muji's or Cognition's identity.
- **Words:** real commands only, each run once against the built tool. The install line is one prop: the repository address until the owner publishes. Nothing implies solvers are waiting. No "funded", "guaranteed" or "escrow".

## The stop for the owner

Before polishing, render the first screen, one owner step and the solver path, on desktop and phone, light and dark, plus one alternative illustration direction, and publish them as a private page. Then stop and ask. The owner's eye decides the look; a fresh-agent check does not.

## Also: what you owe

`/me/` gains "you owe" and "owed to you" (BACKLOG, left by PF4; K43's page table): whom, how much, since when, one link to the bounty page. Same rules as PF4's facts. The page's primary action stays one.

## Tests (`test:platform`)

- The page checks already run on every page apply to `/` and `/board/`: money words, private bytes, one primary action, sizes, weights, colours.
- Every command on the page runs against the built CLI and is recognised, by a test that reads them from the page.
- `/board/` keeps every filter; `/` shows no private repository, including its newest-bounties list.
- `/me/`: an owner sees what they owe and a solver what is owed to them; another account never sees either; a restricted method never appears there.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0 on the final commit.
- The owner approved the look at the stop, recorded in the Result.
- **Fresh-agent check:** two fresh sessions given only the running front page, one told "you own a project and an agent", one "you want to earn by solving". Each says what the product does, what becomes public, and its exact first step. Both must be right; misreadings are recorded and fixed.

## Lenses

- [x] **Security:** poster text in the newest-bounties list renders as text; no restricted method or private repository reaches the page or its export.
- [x] **User experience:** the fresh-agent check, plus keyboard and contrast on the new page, and a real browser on desktop and phone.
- [ ] **Measurement fairness:** not applicable.

## Notes

- Prototype playbook for the look, then feature; principles: prove-it-works.
- Load the host's artifact-design guidance if publishing the stop page as an artifact. It is private until the owner shares it.

## Plan

1. Throwaway prototype of two directions (A one path, B a drawing per step); publish privately; stop for the owner. Nothing below starts before the owner chooses.
2. Build: `/board/` takes today's board and `Board.jsx`'s links; `/` gets the brief's sections with `components/Parcel.jsx` and a three-card newest list; nav gains Board, `/how/`'s primary goes to `/board/`; `GET /api/me` gains `you_owe` and `owed_to_you` (states `owed`, `owner-decides`; excluded bounties left out; no methods), shown as links on `/me/`.
3. Tests in `tests/platform/`: page checks on `/` and `/board/`, no private repository on `/`, hostile title as text, every command on the page run with `--help` against the built CLI with a bogus one failing, `/me/` per viewer. Existing board tests move path only; the Result lists them.
4. Verify, real browser, keyboard and contrast, two fresh sessions, then close.

Install finding at the stop: `box-bounty` is not on npm and has no `bin`; a clean clone, two installs, a build and `node packages/box-cli/dist/cli.js bounty help` worked.

---

## Result

- CTO: <host / model>
- Commit: `<SHA>`
- Verify: `<summary line>`
- Checks: the three questions answered · Level: ui-verified | test-verified | typecheck-only
- Lenses: <what was tried and what was found>
- Method: <playbook; each principle that changed a decision and what it changed>
- Findings and limits:
- Merged: `<merge SHA>` · Verify cost: `<line from node scripts/kitchen-stats.mjs --wave=PF7>` · Resources removed: yes | <what remains and why>
- Reflect: <what went wrong> -> <wave | station | kitchen>: <what it became, or "nothing">
