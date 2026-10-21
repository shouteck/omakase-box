# PF1: the open board and bounty pages

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF1` · Timebox: 300 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-20-platform; D-2026-10-21-no-platform-money; D-2026-10-21-platform-v1 (feature 1, the board, and feature 3, bounty pages); D-2026-10-21-k44-decisions; spend no money

**Brief.** Written ahead by the CTO on 21 October 2026, before K43 finished. **Before dispatch, the CTO reconciles it with K43's `docs/box-v4/PLATFORM-UX.md`** (stack, hosting, page content, field names, visual rules) and corrects names only. A change of substance goes back to the owner. Cook: high; reviewer: high.

## Outcome

`packages/box-platform/` serves, on a local machine, a public board of every open box bounty on public GitHub and a page per bounty, exactly as K43 designed. It is proven against a GitHub stand-in, with no deploy, no account and no money.

## Scope

- **Write:**
  - `packages/box-platform/` (new; the stack K43 recommends, Next.js with Tailwind unless K43 says otherwise);
  - a new verify suite `test:platform` (root `package.json` script plus its entry in `scripts/suite.mjs`'s reach map, so `node scripts/verify.mjs` runs it);
  - its tests;
  - `waves/PF1.md`.
- **Do not touch:** `packages/box-bounty`, `packages/box-cli` (PF5 changes the CLI); hosting accounts; anything live.

## What it does

1. **Finding bounties.**
   - Search GitHub for issues carrying the bounty label and the `<!-- box-bounty:<id> -->` marker.
   - Parse the `box-bounty-format` block (`docs/box-v4/BOUNTY-FORMAT.md`; reuse the reader the format test proves, never a second parser).
   - Read the repository's `visibility` and default branch.
   - Keep the bounty only if the repository is **public** and the block is valid.
   - Read the pull requests on `box-bounty/<id>` (`state=all`, `base` filter) and the issue's state.
   - Read the shared-memory events under `refs/box-bounty/<id>` through GitHub's Git data API, for the page's history.
   - Everything is read from GitHub, never from a hint. Hints arrive in PF5 and only say "look now".
2. **Storing.**
   - The free database K43 chose, holding only identifiers and facts the platform read.
   - Refresh on a schedule that stays inside GitHub's rate limits, with the numbers stated: unauthenticated 60 an hour, or an app token the owner creates later.
   - A repository that becomes private disappears at the next refresh and at render time.
3. **The board:**
   - K43's list card, with search and the filters: language (the repository's primary language), repository, stated reward, age, number of solutions, posted by an agent or a person (from the block or the record's facts, only where the platform can know it).
   - Pagination, and an empty state that names its next step.
4. **The bounty page:**
   - the task, marked as the poster's words;
   - how to answer: branch from `box-bounty/<id>`, open a pull request against it;
   - the stated reward with "the owner pays directly" (payment facts arrive in PF4);
   - its solutions (author and pull-request link);
   - its history from the shared memory.
   - Never "funded", "guaranteed" or "escrow".
5. **The visual rules** of K43: minimalism, light and dark, phone width, WCAG 2.2 AA.

## Tests (`test:platform`)

| Case | Expected |
|---|---|
| A public repository with a valid block | Listed, with every card field matching the stand-in's facts |
| A private repository with a valid block | Never listed, never rendered, not even by direct URL |
| A repository that turns private after listing | Gone at the next refresh and at render |
| A malformed or missing block | Not listed; the reason recorded in the platform's own log |
| Two pull requests on the bounty branch, one merged | Both shown with their states |
| The poster's task text containing HTML or script | Rendered as text, never executed |
| Filters and paging | Correct counts on a seeded stand-in of 120 bounties |
| Rate limits | Refresh stops at the stated budget and resumes; nothing crashes |

**Bite:** remove the visibility check in a scratch copy; the private-repository case fails. Record it.

## Done when

- `node scripts/verify.mjs test:platform test:kitchen` exits 0 on the final commit (and `test:box-bounty` if any shared code is touched); hosted CI runs the new suite and is green after merge.
- The platform runs locally with one documented command, with the stand-in; screenshots of the board and a bounty page, light and dark, desktop and phone, are under the gitignored `out/`.
- No secret, token or account exists anywhere in the diff.

## Review lenses

- [x] **Security:** the private-repository rule at every step; untrusted issue text rendered safely; no token in code.
- [x] **User experience:** the pass compares each page with K43's design and checks contrast and keyboard use.
- [x] **Measurement fairness:** the pass seeds its own stand-in case and checks the card facts against it.

## Notes for the worker

- Feature playbook; principles: prove-it-works, write less code of higher quality.
- Downloads (the stack's npm packages) are named on the pre-cook card and wait for the owner's "go".
- Do not edit `waves/PF1.md` while a verify runs. Report at the timebox.
