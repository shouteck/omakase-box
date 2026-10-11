# Status

Replaced by the CTO on 11 October 2026, at the close of BT6a-ci.

## Now

- **BT6a-ci is merged.** START.md gave failed master verification precedence over the requested BT7. The two missing-gh tests now isolate executable lookup instead of retaining installation directories that also contain gh. Product behavior and expected outcomes are unchanged. Independent review passed on `9a59b25`; merge `b0dce53`. Local verification passed 188 bounty tests without skips. Hosted Linux verification after push is pending; the last completed hosted run was red on `d35e194`.
- **BT7 has not started.** This START run stops after the repair. Next kickoff reads the latest hosted result first.
- BT1–BT6a are merged. BT6a publishes a bounty on existing GitHub history with relevant commits and explicitly needed WIP, replacing the parentless snapshot. The second real bounty, issue #3 and solver PR #4, exercised collection, apply and undo; the solver answer was reapplied to master. Issue/PR and both remote branches are closed/deleted.
- Carried live defects from BT6a: confirm/post bookkeeping changes drift the approved WIP set and cause `github-preview-stale`; terminal `undone` prevents the rehearsed reapply and undo does not reopen the issue; leftover WIP bytes can block collection apply. See [BT6a result](waves/BT6a.md). These remain for a correction wave.
- `.box/limits.json` allows GitHub only. Rewards remain $0; no payment implementation or bounty site. Apache 2.0 license. The tool is installed with reminders off.
- The lab is paused; C1 trace is kept and unused. Unmerged local `wave/A6` and `wave/K7` remain for the owner. Main checkout is on master; no wave is running.

## Next

BT7 look, choose, resolve a clash, then BT8 standing rules, BT9 hook and BT10 open bounty format plus the whole journey. Pre-briefs are under `waves/`; revise each against the preceding results before dispatch. Send `START.md BT7` after the repair. A failed hosted master check still takes precedence.

Other carried findings: unpinned lineCounts git diff; silent answer collection; refusal/exception paths still unquoted; closing a PR by deleting its base can look like rejection. The live defects above and detailed evidence remain in BT6/BT6a wave records.
