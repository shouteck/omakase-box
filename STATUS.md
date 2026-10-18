# Status

Updated by the CTO on 19 October 2026 at the K32 close.

## Now

- **K32 merged** (`28d7a7f`; PASS test-verified on `30ca1c7`). Agent payments researched from primary sources: every agent-payment protocol pays merchants with endpoints; the only route that pays a person with no custody and no per-payment approval is USDC sent from the owner's wallet to the solver's (x402 `exact`). Prototype against a local stand-in, 24/24; no account, key or money. **Owner decision open:** keep USDC for rewards (then a build adds the wallet route after one approved test-network payment) or not (the build records owed and paid, paying by hand). Pass findings carried to the build in BACKLOG.md. Hosted checks green.

- **K15-ci merged** (`fad8e44`; PASS test-verified on `4982a28`). Master was red on the first full hosted run of BT35's code: the K15 sandbox guard crashed (`ENOBUFS`) reading a wave-file diff that had grown past Node's 1 MiB default. Not caused by BT35. The guard now reads any size and fails by name. **Both hosted jobs green** (run 39145603255).

- **BT35 merged and pushed** (`1eb8697`). Open bounty views show age and last-solution activity; posted bounties idle at least 14 days get one optional waiting/ending notice per bounty, capped at three oldest-first per command. Nothing closes automatically.
- **Independent acceptance:** fresh pass `a5bb4150` recorded PASS, test-verified, on exact candidate `dd7006d`, verdict commit `2f09848`. Its completed full-profile invocation audited and reused the real clean 695-second same-SHA run. Bounty 715 passed and 1 skipped; kitchen 89 passed; BT35 23 passed.
- **Hostile timestamp proof:** rebuilt-CLI probes confirmed parseable non-ISO and impossible dates become explicit unavailable/null age facts, not `NaN`, non-ISO output or false older latest activity. Only machine-local once-said state changes; record and shared-chain invariants remain covered.
- **Bounds and history:** existing output budgets unchanged. Earlier failed candidates, the dirty run, compaction correction and 45-minute overrun remain recorded; final review completed in the separately approved 15-minute window. No universal 4,500-character or performance improvement claim.
- Main checkout is master with rebuilt CLI output. Both fully merged local BT35 branches deleted. No matching kitchen test/Postgres process or covered temp item found; reviewer scratch removed. Latest hosted result before merge was green `39142250427`, 3m22s; post-push checks are not awaited.

## Next

This run stops after BT35. No wave is in flight or starts automatically. BT36 remains available when named; K30's K29/BT32 dependencies are satisfied. BT33 stays parked and BT12 Part B stays deferred.
