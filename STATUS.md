# Status

Updated by the CTO on 18 October 2026 at the BT32 parked close.

## Now

- **BT32 parked, not merged.** Independent reviewer FAIL. Product and full review remain on local `wave/BT32` at `73fb4be`; no BT32 product changes reach master.
- **Blocking measurement:** completed production run 9 imports 1,000 chains in **413,297 ms**, against the brief's roughly 12,000 ms ceiling. Per-chain `rev-list` and per-event `cat-file` subprocesses dominate. The performance gate is not relaxed.
- **Tests passed, acceptance did not:** the reviewer completed `verify c547e5f PASS check=0 build=0 test:box-bounty=0 test:box-package=0 test:kitchen=0 db=none 887s` on a clean exact candidate. This does not override the failed scale gate or missing fresh-agent legs.
- **Real GitHub preflight succeeded**, with limits recorded: default clone isolation, explicit fetch, concurrent push rejection/merge/retry and deletion/restoration. Restoration used an older clone tip, so that leg proves ref recovery, not latest-history preservation. The test ref is absent; all BT32 scratch and its recreated test cache were removed.
- **Fresh-agent evidence partial:** why/tried, job, follow-up and outcome were recalled. Cached answers survived offline, but no attempted refresh/staleness notice was observed within the 60-second throttle. M5/M11 journey legs remain untested. K14 budget changes also exceed the brief's literal five-fetching-command allowance, which conflicts with required milestone writes.
- Other-session roadmap/K33 brief (`0c4af74`) preserved. Latest completed hosted result read was green (`39051230113`); no wait for hosted checks. Master retains the shipped BT31 store and K28 research. Rebuilt master artifacts successfully so the local CLI no longer runs the parked candidate; this build is not a new acceptance claim.

## Next

This run stops here. Recommended next BT32 attempt: a fresh worker batches chain object reads and tip comparison, adds a process-count bound, then remeasures against the unchanged scale gate; completes the missing fresh-agent legs; reconciles the K14 wording without weakening checks; and obtains a new exact-candidate review. Read `waves/BT32.md` and the parked branch before resuming. No other wave starts automatically. **BT33** stays parked; **BT12 Part B** stays deferred.
