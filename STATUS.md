# Status

Updated by the CTO on 18 October 2026 at the BT32 resumed parked close.

## Now

- **BT32 still parked, not merged.** Final reviewer verdict is FAIL at local `wave/BT32` commit `c9eeca3`. No BT32 product code or tests reach master.
- **Scale blocker fixed:** batched object reads/ref adoption reduced first import at 1,000 chains from 413,297 ms to 5,479 ms; independent rerun 5,347 ms, below unchanged 12,000 ms gate. A fixed Git-process-count regression now covers the fanout.
- **New security blocker:** `retryPending` auto-pushes an attacker-planted local chain ref; the next fetch imports it as remote-trusted. That bypasses the required local-ref provenance boundary and can publish secret-bearing text without the event-write scan. Corrected regression fails on the unfixed implementation.
- **Prior green suites are not acceptance:** exact candidate `07d3777` passed all three named suites in the reviewer's 1,732-second run, but its original forged-ref probe incorrectly asserted that upload was acceptable. CTO blocked merge; corrected probe failed, and the reviewer superseded the preliminary PASS verdicts.
- **Second-machine journey completed:** reasons, task, larger job/follow-up and outcome recovered; look/apply/close refused shared-only; after 76 seconds offline cache survived and the refresh notice appeared once. Plain branch log/grep stay clean. `git log --all` correctly exposes explicitly fetched custom refs; the old fixture key's contrary expectation is recorded, not hidden.
- Recorded GitHub preflight and its older-tip-restoration caveat remain valid; no new sandbox writes this run. All resumed scratch and recreated test cache removed. Master retains shipped BT31 and K28; only close documents and immutable evidence are published.

## Next

**Security correction approved and starting**, approximately 14:25-16:25 +08 on 18 October. A fresh worker binds pushes and graph merges to tool-authored pending/validated recovery provenance and exact tips; tests first-push prevention, second-fetch non-adoption and replaced-tip attacks without disabling legitimate retry/recovery; keeps the scale gate/process bound; obtains new exact-SHA verification and independent review. No new sandbox writes or extra wave. Latest hosted close-document run (`39103835337`) is in progress, not a recorded pass. **BT33** stays parked; **BT12 Part B** stays deferred.
