# PF1: the open board and bounty pages

Milestone: PF (the platform) · Station: packaging · Base: `master at dispatch` · Branch: `wave/PF1` · Timebox: 300 minutes; at expiry, report partial findings and stop
Owner decisions: D-2026-10-20-platform, D-2026-10-21-no-platform-money, D-2026-10-21-platform-v1, D-2026-10-21-k44-decisions, D-2026-10-22-k43-decisions
Owner context: D-2026-10-20-platform; D-2026-10-21-no-platform-money; D-2026-10-21-platform-v1 (feature 1, the board, and feature 3, bounty pages); D-2026-10-21-k44-decisions; spend no money
Horizon: long: start with `/plan` and keep the plan in this file

**Brief.** Written ahead by the CTO on 21 October 2026, before K43 finished. **Before starting, the CTO reconciles it with K43's `docs/box-v4/PLATFORM-UX.md`** (stack, hosting, page content, field names, visual rules) and corrects names only. A change of substance goes back to the owner.

**Reconciled with K43 (names only, 31 October 2026).** Routes in PF1: `/`, `/b/<id>/`, `/how/`, `/agents/`. Storage: Cloudflare D1. The "posted by an agent or a person" filter is "posting approved" (`posted.allowedBy.decision`, D-2026-10-22-k43-decisions); `owner_record` waits for PF4. The card has K43's three lines; line 3 is "Posted by X, who pays the solver directly." until PF4. Screenshots: `packages/box-platform/out/screenshots/`. Write paths the Done when needs, added: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore`, `.github/workflows/verify.yml`, and `kitchen/demo/record.mjs` with its test (its stale-build check walked every package; `next build` writes `.ts` files, so the CLI read as stale). The acceptance profile stays as it is: hosted CI runs the platform suite as its own step.

## Plan

Agreed with the owner in plan mode, 31 October 2026.

1. Pure core, thin hosts: one `handle(request, env)` and `refresh(env)`. Deployed as a Worker with D1; locally over node HTTP and a D1-shaped shim on `node:sqlite`, same SQL.
2. Pages are static shells; data comes from `/api/board` and `/api/b/<id>`, filtered on the server. `/b/<id>/` serves one shell for any id. Plain `<a>` links avoid the `__next.*.txt` trap; a test clicks through two pages.
3. Private rule at read, at refresh and at render. Render: the page API re-reads a repository whose read is over 5 minutes old and purges if not public. Stated limit: the list renders from the store, so a flip shows there until the next refresh (at most 15 minutes) or the first page view. A private drop's log line names no repository.
4. Budget: 60 an hour unauthenticated, 15 per 15-minute tick; 45 per tick with a token (Workers Free allows 50 subrequests). One search, then the stalest details; resumes next tick.
5. Reuse `readFormat` from `packages/box-bounty/format.ts`. Memory events: strict projection of only the fields shown.
6. Steps: store and refresh; API; pages and browser tests; suite and CI, then the bite; one `wrangler dev --local` run with CPU measured against 10 ms (if workerd will not run here, the Result says so and PF6 inherits it); verify and close.

States needing payment facts (recorded, confirmed, disputed) arrive in PF4.

## Outcome

`packages/box-platform/` serves, on a local machine, a public board of every open box bounty on public GitHub and a page per bounty, exactly as K43 designed. It is proven against a GitHub stand-in, with no deploy, no account and no money.

## Scope

- **Write:**
  - `packages/box-platform/` (new; the stack K43 recommends, Next.js with Tailwind unless K43 says otherwise);
  - a new verify suite `test:platform` (root `package.json` script plus its entry in `scripts/suite.mjs`'s reach map, so `node scripts/verify.mjs` runs it);
  - its tests;
  - `waves/PF1.md`.
- **Hosting (owner, D-2026-10-22-k43-decisions):** Cloudflare Workers Free with static assets and D1 on `*.workers.dev`; pages as a static export, the feed, MCP and sign-in as Worker routes; mind K43's static-export trap (`__next.<segment>.__PAGE__.txt` mapping, PLATFORM-UX.md section 8).
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

- `node scripts/verify.mjs` with the new platform suite this wave adds and `test:kitchen` exits 0 on the final commit (and `test:box-bounty` if any shared code is touched); hosted CI runs the new suite and is green after merge.
- The platform runs locally with one documented command, with the stand-in; screenshots of the board and a bounty page, light and dark, desktop and phone, are under the gitignored `out/`.
- No secret, token or account exists anywhere in the diff.

## Lenses

- [x] **Security:** the private-repository rule at every step; untrusted issue text rendered safely; no token in code.
- [x] **User experience:** the CTO compares each page with K43's design and checks contrast and keyboard use.
- [x] **Measurement fairness:** the CTO seeds its own stand-in case and checks the card facts against it.

## Notes

- Feature playbook; principles: prove-it-works, write less code of higher quality.
- Downloads (the stack's npm packages) are named on the pre-cook card and wait for the owner's "go".
- Do not edit `waves/PF1.md` while a verify runs. Report at the timebox.
