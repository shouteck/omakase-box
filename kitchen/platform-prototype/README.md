# Open bounty board: clickable prototype (K43)

A static prototype of the board designed in [`docs/box-v4/PLATFORM-UX.md`](../../docs/box-v4/PLATFORM-UX.md). **Sample data only:** every name starts with `example-`, every page says so, and nothing you click leaves your browser. No backend, no accounts, no money.

## Run it

Needs Node 24. From this folder:

```sh
npm ci && npm run build && npm start
```

Then open http://localhost:4310/. `npm start` serves `out/` with `scripts/serve.mjs` (plain Node, no dependencies). It also stands in for the board's one per-viewer answer, `GET /prototype-server/methods`, which sends an owner-only payment method only where `server/grants.json` names the viewer. Served by any other static host, the pages work and say that owner-only methods are unavailable.

The install uses `.npmrc`: nothing published after 14 October 2026 (the repository's seven-day rule) and no install scripts. Dependencies: `next`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `@fontsource/inter` (Inter, SIL Open Font Licence 1.1).

## What is here

| Path | What |
|---|---|
| `sample/sample.mjs` | The sample world as an anonymous visitor may see it, each field tagged with where the real board would read it (block, GitHub, shared memory, board). |
| `sample/restricted.mjs` | What no visitor may see: one private-repository bounty that must never appear, and the values of owner-only payment methods. No page imports it; the build reads it to write `server/grants.json`. |
| `server/grants.json` | The prototype server's answers for owner-only methods, one per viewer the rule allows. Outside `public/`, so never in the static export. |
| `lib/facts.mjs` | The domain: one state machine (`stateOf`), the payee rule, owner and solver records with the self-dealing exclusion, feed entries and `get_bounty` details. Every page and file is derived from it. |
| `app/`, `components/` | The pages: board `/`, bounty `/b/<id>/`, owner `/owner/<login>/`, solver `/solver/<login>/`, your page `/me/`, sign-in, how it works, for agents, and `/prototype/` (an index of every state). |
| `public/bounties.json`, `public/bounties/<id>.json`, `public/people/<login>.json`, `public/rss.xml` | The sample machine interface, written by `npm run feed` (part of `build`). |
| `mcp/tools.json` | The MCP tool descriptions (`find_bounties`, `get_bounty`). |
| `mcp/standin.mjs` | A dependency-free stand-in answering both tools from the sample files: `node mcp/standin.mjs find_bounties '{"language":"TypeScript"}'`, or `--stdio` as an MCP server. |

## Checks

- `npm run check`: the prototype's own tests (`node --test`): the feed matches the facts; no private repository and no owner-only value in any file of the export (JS, JSON, TXT, HTML, XML, CSS); owner-only methods only where the rule allows; "owner decides" owed alike on page and record; self-dealing read from `author_association`; no money claim; bounds and paging; stand-in and board filter alike; self-dealing not counted; attribution; method visibility; every state has a sample; AA contrast of every colour pair. Run after a build: without `out/` the built-file checks report "skipped", never a pass.
- `npm run screens`: every page and state, light and dark, desktop and phone, into `out/screenshots/` (gitignored), with `report.json` measuring font sizes, weights, shadows, gradients, the sample label and the first tab stops on the real pages, then behaviour checks in the browser (owner-only methods, "owner decides", focus after a click, the skip link); any failed check fails the run. It uses the Playwright already installed at the repository root and downloads nothing.

The prototype is outside the pnpm workspace and outside `node scripts/verify.mjs`.

## The prototype's controls

Sign in by choosing a sample account (`/sign-in/`). "Record paid" and "Confirm received" are kept in this browser's localStorage; `/prototype/` resets them. `/?state=empty` and `/?state=error` show the board's empty and GitHub-unreachable states.
