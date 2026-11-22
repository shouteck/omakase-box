# Release 0.4.3

Scope: bump the synced release surfaces to 0.4.3 after take preview (#52) and recording off-board payments without a listed method (#43). npm `omakase-box`, the omakase-skills skill and plugin, the hosted MCP Worker's `serverInfo.version` and the MCP Registry record move together. No behaviour change in this commit.

Done when: CI verify is green on this commit, one local poster-to-paid rehearsal (`packages/box-platform/local-board-rehearsal.mjs`) passes on it (take and payment code changed), and `node scripts/check-release-versions.mjs` reports 0.4.3 everywhere once the owner publishes npm.

## Changed expectations

- tests/platform/pf6-registry.test.ts::validates the remote-only document against the vendored schema — the registry record's version tracks releases (REGISTRY-0.4.2); pin it to 0.4.3.
