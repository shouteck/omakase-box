# INTENT-PAGES: crawlable delegation and earning entry points

Milestone: platform · Station: packaging · Base: `f6ad9886` · Branch: `devin/1795370781-intent-pages`
Horizon: long. Owner request authorizes this branch only: no deploy, merge or master push.

## Outcome

Two server-rendered intent pages, canonical metadata, a public sitemap, permanent legacy redirects and README entry links, using existing components.

## Plan

Feature playbook read; architect skipped because the owner prescribes existing page styles and the Worker route precedent from PF50. Minimize Reader Load keeps routing explicit and avoids a new framework layer.

- Blocking first steps: verify CLI commands, MCP tool names and static-export deployment.
- Independent workstreams: pages and route tests are coupled; serialize with one writer.
- Shared mutable state: only this branch; no external state changes.
- Smallest safe decomposition: implement pages/routes/coverage, then build and verify the committed candidate and curl the local server.

## Scope

Intent pages, minimal agents copy, Worker sitemap/redirect routes, README links, platform tests. No payment behavior, shared config or deployment changes.

## Done when

- Requested build, platform and bounty verification pass on the committed candidate.
- Local HTTP checks show crawlable pages, XML sitemap and 308 redirects for both slash forms.
- Sitemap excludes account, auth and per-bounty addresses; unsupported writes return 405.
- New prose uses Omakase Box and clearly states human listing/reward approval and manual payment today.

## Changed expectations

None. Existing source-reading assertions remain intact.

## Lenses

- [x] User experience: reuse Title, SideSection and CodeBlock; read the rendered HTML and check links. Visual layout is not verified unless explicitly recorded.

## Result

- Host: Devin Linux; model identity not independently exposed. Implementation commit: `7623145b`.
- `node scripts/workspace.mjs build`: 57 modules transformed; built in 108ms; exit 0.
- `env HOME=$HOME/kitchen-home node scripts/verify.mjs test:platform`: 28 files / 563 tests passed; selected kitchen 5 files / 43 tests passed. `verify 7623145 PASS check=0 build=0 lint=0 test:platform=0 test:kitchen=0(selected 5 of 26 kitchen files) db=none 126s`.
- `env HOME=$HOME/kitchen-home node scripts/verify.mjs test:box-bounty`: 124 files passed; 1473 tests passed, 19 skipped. `verify 7623145 PASS` with check/build/lint and selected kitchen reused from the platform run; bounty exit 0; db=none, 218s. Logs: `.kitchen/runs/2026-11-22T18-07-36-624Z-7623145` and `.kitchen/runs/2026-11-22T18-09-44-648Z-7623145`.
- Started `node packages/box-platform/local.mjs`. Actual `curl -sI`: delegate, earn, agents and sitemap 200; post and post/ 308 to `http://localhost:4320/delegate/`; docs and docs/ 308 to `http://localhost:4320/agents/`. Sitemap body lists exactly the 11 public pages in the test. Server stopped after checking.
- Used the PF50 Worker route pattern instead of Next sitemap/redirect APIs: this deployment exports static pages and runs `api.ts` before assets, as PR #45 does for llms.txt. No robots.txt exists, so none was modified.
- npm README source is `FIRST-FIVE-MINUTES.md` (`packages/box-cli/pack.mjs` copies it); updated that and root README. Verified CLI syntax in bounty.ts and MCP names in mcp.ts.
- Diff reviewed against scope; no changed existing expectations. New coverage checks built HTML (not hydrated-only content), canonical/description metadata, CLI ordering, manual payment statements, empty-board sitemap, private-route exclusions, both slash forms and HEAD redirects, unsupported writes and unknown-route errors. Standalone Omakase/Box search in added copy: 0 hits. `git diff --check` clean.
- Level: test-verified. UX lens: rendered HTML and local HTTP checked; visual layout is unverified. Hosted CI has not been checked. No deployment or merge; branch push only.
- Method: Feature playbook; Minimize Reader Load kept one explicit public-page list and existing page primitives rather than adding shared page abstractions. Reflection: npm README is generated from a differently named document; wave-level note records that source to avoid editing generated output.
