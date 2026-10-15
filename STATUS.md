# Status

Updated by the CTO on 15 October 2026 at the BT15-ci close.

## Now

- **BT15 completed.** Reviewed product commit `3174c899`, independent PASS ui-verified; verdict documentation ends at `0586b30`. Merged as `ce5c81e`; newer owner roadmap commits were integrated without product changes.
- Bounties use GitHub. New drafts write no sibling package folder; create has five named inputs and accepts the task on standard input. Folder delivery, folder solutions and the retired create options refuse by name without changes. Existing owner folders stay untouched. Old unposted drafts can post; retired posted records remain readable and closable.
- Exact clean acceptance passed: `verify 3174c89 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 631s`. Bounty 476/476; package 142 passed with six existing skips. The fresh reviewer's own invocation exited 0 using those exact recorded results. The unchanged packaging color test needed a process-local color environment; no global setting or expected outcome changed.
- A fresh agent completed posting, collection and merging through the built CLI and local GitHub stand-in. Its final task omitted what it tried, a recorded UX limit. An earlier trial's wrapper error and all failed acceptance attempts remain in the wave record.
- No real bounty, payment, owner-settings change or solver-code execution occurred. The detached baseline worktree and all owned BT15 scratch roots/helpers were removed; raw observations are auxiliary files in the existing acceptance run record. Source task text in issue bodies retains its existing scan boundary, documented in BACKLOG.md.
- **BT15-ci completed.** The hosted check after BT15 went red on Linux: one test assumed the temp folder sits under the home folder. The fixture now lives under the home folder on every system; no assertion or product code changed. Reviewed `50f33fb`, PASS test-verified, `verify 50f33fb PASS check=0 build=0 test:box-bounty=0 db=none 680s`; merged as `47d8f3a`. The hosted run after this push is the Linux evidence.
- Known flake: `report.test.ts` "no attempt's report carries a verdict word" runs just over its 30 s limit under three workers on this host (red twice on the BT15-ci tip, unrelated to it). Recorded in BACKLOG.md for a small wave.

## Next

BT15 and its correction BT15-ci ran. No wave is in flight.

The owner queue remains **BT16**, **K20**, **BT17**, **K21**, in that order. Their briefs are present; BT17 follows K20 so K21 sees the final output. The newer BT12 npm-package direction is preserved in its brief and PLAN.md. None of these waves started here.
