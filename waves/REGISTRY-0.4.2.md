# Registry metadata 0.4.2

Scope: mirror the owner's supplied MCP Registry record in `docs/box-v4/launch/server.json`, preserve repository formatting, and correct the listing's version guidance. No package version or publication changes.

Done when: the registry and listing Vitest files pass, and `HOME=$HOME/kitchen-home node scripts/verify.mjs check` passes on the committed candidate.

## Changed expectations

- pf6-registry.test.ts::validates the remote-only document against the vendored schema — server.json now mirrors the published MCP Registry record (owner-published 0.4.x title/description); version tracks releases. Pin this record to 0.4.2, assert its title and description, retain human approval, and remove the old skill/CLI/MCP ordering assertions.

## Scope check

`pf6-listings.test.ts` checks listing paste blocks and skill/plugin metadata, not `server.json`; its expectations are unchanged. `scripts/verify.mjs` invokes `scripts/test-edit-gate.mjs`, which automatically selects `waves/<ID>.md` only on `wave/<ID>` branches. This requested `devin/` branch uses an explicit `--wave REGISTRY-0.4.2` gate check.
