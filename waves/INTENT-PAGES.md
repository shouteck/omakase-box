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

Pending checks. Host: Devin Linux. No deployment or merge.
