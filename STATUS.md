# Status

Updated by the CTO on 18 October 2026 at the BT32 completed close.

## Now

- **BT32-ci merged** (`f23125a`) — the red hosted run's cause fixed: `bt32.test.ts:360`'s `commit-tree` seed now carries `-c` identity like every other call; PASS test-verified on `a9c4729`, sweep found no second omission. Post-push hosted run not awaited; read it before BT34's merge.
- **BT34 in flight** on `wave/BT34` — the named wave of this run; bounty tool cut free of `box-package` so K29 can remove the platform.
- **BT32 merged** (`6cd2559`). Independent PASS, test-verified, on exact candidate `63d3e60`; final fresh reviewer verdict `0fa1fc8`. Earlier parked FAILs and superseded approvals remain in `waves/BT32.md`, not the current state.
- **Shared memory built:** posted-bounty milestone events use per-bounty custom Git refs, fetched into the local SQLite shared cache. Drafts and machine detail stay local; ordinary clones and branch files do not receive the chains. Shared-only bounties are read-only.
- **Trust fixes proven:** per-id authored/imported provenance and exact tips gate pushes, parents and merges. Push source is the proven commit SHA, never the mutable ref name. Planted/swapped refs and the push-boundary race are blocked; legitimate retry, concurrent merge and import-only-clone deletion recovery pass.
- **Scale gate passed:** final independent production measurement imports 1,000 chains in **5,157 ms**, versus unchanged **12,000 ms** ceiling. Five append samples 300-329 ms and fetch samples 367-408 ms pass this run; earlier 893/899 ms outliers remain recorded. Counted subprocess regression protects batching.
- **Checks passed on the accepted SHA:** all three named suites executed clean in the worker's 1,001-second run. Final reviewer's own completed invocation reused that same-SHA record and independently ran the hostile probes and production measurement. Fresh-agent second-machine recall/refusals/offline journey and mechanical corrected-artifact recheck are preserved.
- Main checkout is master; merged branch deleted. No BT32 test/measurement processes, scratch roots or embedded test databases found at close; recreated test cache removed. No new sandbox writes during corrections. Latest hosted run read before merge was green (`39103835337`); the post-push run is not awaited.

## Next

This run stops after BT32. No wave is in flight and none starts automatically. Remaining roadmap briefs are available when named; **BT33** stays parked and **BT12 Part B** stays deferred. Payment event schema exists, but owner-recorded payment remains BT36's work.
