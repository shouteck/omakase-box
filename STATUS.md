# Status

Updated by the CTO on 11 October 2026, at kickoff of BT6a-ci.

## Now

- **BT6a-ci takes precedence over BT7.** Latest completed hosted run 38124324459 on `d35e194` failed two missing-gh fixtures because Linux installs git and gh together. The repair isolates test executable lookup without changing product behavior or expected outcomes. BT7 remains queued; this START run stops after the repair.

- **BT6a is done — merged and pushed** (implementation `4e1997c`, real-post record `0e9ee0f`). A GitHub bounty is now an issue on the code already on GitHub: `post --to github` points `box-bounty/<id>` at a commit the remote already has, plus relevant unpushed commits, plus the uncommitted work only when the agent says the task needs it. Measured on the real post: one small commit on public history vs BT6's ~30 MB parentless snapshot.
- **The second real bounty ran the harder path in public:** issue [shouteck/omakase-box#3](https://github.com/shouteck/omakase-box/issues/3) → blind solver's PR #4 against `box-bounty/bt-4ad668353616` (one WIP commit `8d168d3` on real history) → independent collector judged apply → merge `2421c4e`, undo revert `6670a57` → solver answer returned to master as `3469fc6` ("reapply after undo exercise"). Issue and PR closed, both remote branches deleted.
- **Real use caught three product findings the fixtures could not:** (1) the tool's own bookkeeping writes between `confirm` and `post` drift the approved WIP set — `github-preview-stale` deadlocks any `--with-changes` post when `AGENTS.md`/`OPEN` are tracked; (2) `undone` is a terminal stage, so the brief's rehearsed apply→undo→apply journey is impossible and undo never reopens the issue; (3) leftover WIP bytes in the worktree trip `apply-worktree-dirty` at collection. All carried to the next correction wave; details in [waves/BT6a.md](waves/BT6a.md).
- **`.box/limits.json` now allows `github` only** — `post --to <dir>` refuses until the owner names a directory again. That is how the tool gates destinations; not a defect.
- BT1–BT6a are merged; the tool stays installed in this repository with reminders off.
- The lab is paused. C1's `box trace` is kept and unused. Unmerged local `wave/A6` and `wave/K7` are left for the owner.
- Master was clean at kickoff. BT6a-ci is in progress.

## After BT6a, in order (PLAN.md, "Remaining waves")

BT7 look, choose, resolve a clash · BT8 standing rules · BT9 the hook · BT10 the open bounty format and the whole journey run once. All four have pre-briefs ([BT7](waves/BT7.md), [BT8](waves/BT8.md), [BT9](waves/BT9.md), [BT10](waves/BT10.md)); the head chef revises each against the preceding wave's Result before dispatching, and each cooks only when named. **No payment of any kind is implemented and no bounty site is used** (owner, 11 October 2026): every bounty states a reward of $0, and the kitchen is the solver in every real run. The repository is licensed under Apache 2.0 since 11 October 2026.

Carried findings for later waves (BT6 and BT6a): `lineCounts`' unpinned `git diff --numstat` is safe today but pin it for consistency; `answer --pr` ran ~2.5 min silent — a progress line is a nit; solver-path quoting is now done on master but refusal/exception messages still print paths unquoted; **the confirm→post drift deadlock and the terminal-`undone` contradiction are live defects** (see Now); a PR closed by base-branch deletion reads as rejection — comment on the PR too; the issue's folder-channel wording is retired on the GitHub path. BT7's `look`/diff view is already on the roadmap.

## Next

**BT7.** Send `START.md: BT7`.
