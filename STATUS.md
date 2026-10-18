# Status

Updated by the CTO on 18 October 2026 at the K29 completed close.

## Now

- **K29 merged and pushed** (`1543dd3`). The named wave is complete. Master holds the bounty CLI, bounty tests and kitchen; older platform apps, services, packages, suites and wiring are retired.
- **Preserved:** `origin/archive/box-platform-2026-10` at dispatch base `d418ee3`; frozen `.execution/` and `docs/legacy/` unchanged. The living `docs/box-v4/MEMORY-SPEC.md` is retained byte-identically after the close-time caller audit.
- **Acceptance:** independent PASS, test-verified, on exact final candidate `c51a71b`. The reviewer completed full-profile verify with audited reuse: check/build/bounty from the unchanged-code ancestor's real 772-second PASS, kitchen from the final candidate's real 71-second suite run. No suite is missing; no database is needed.
- **Behavior:** all four retired subcommands refuse by name. The independent baseline/candidate journey comparison preserved bounty output; root help intentionally loses the four old lines. Obsolete database modes now refuse before work.
- **Measurement limit:** the retired exporter's 330-second ratchet is not a bounty-suite budget. The surviving full profile reports actual seconds without a calibrated limit; explicit configured budgets still fail over-budget. No hosted speedup is claimed.
- Main checkout is master; merged wave branch deleted. Worker/reviewer scratch removed; no kitchen test or embedded database process or covered temp directory found at close. Latest hosted result before merge was green (`39115084938`, 6m25s); the post-push result and after-duration are not awaited.

## Next

This run stops after K29. No wave is in flight and none starts automatically. BT35 and BT36 remain available when named; K30's retirement dependency is satisfied. BT33 stays parked and BT12 Part B stays deferred. BT32 shared bounty memory remains in place; owner-recorded payment is still BT36's work.
