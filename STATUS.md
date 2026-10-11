# Status

Replaced by the CTO on 11 October 2026, at the close of wave BT6 (second run).

## Now

- **BT6 is done — all three parts, merged and pushed** (`81f3476`). Checks are removed: `create` asks only task + why; every answer is a numbered attempt the tool reports facts on and runs nothing from; choosing is always the agent's. The GitHub adapter is live on `shouteck/omakase-box`.
- **The first real bounty ran the whole journey in public:** issue [shouteck/omakase-box#1](https://github.com/shouteck/omakase-box/issues/1) → a blind solver's PR #2 (branch `box-bounty/bt-6b7b1d15d8f0`, one parentless commit, no history shipped) → an independent collector applied it as merge `48b461c`. The fix — cold-copy bootstrap docs — is on master. Issue, PR and both remote branches are closed/deleted; the `box-bounty` label stays by design. Full record: [waves/BT6.md](waves/BT6.md) "Part C".
- **`.box/limits.json` now allows `github` only** — `post --to <dir>` refuses until the owner names a directory again. That is how the tool gates destinations; not a defect.
- BT1–BT6 are merged; the tool stays installed in this repository with reminders off. The off-machine run is green on master.
- The lab is paused. C1's `box trace` is kept and unused. Unmerged local `wave/A6` and `wave/K7` are left for the owner.
- Master is clean. Nothing is running.

## After BT6, in order (PLAN.md, "Remaining waves")

BT7 look, choose, resolve a clash · BT8 standing rules · BT9 the hook · BT10 the open bounty format and the whole journey run once. All four have pre-briefs ([BT7](waves/BT7.md), [BT8](waves/BT8.md), [BT9](waves/BT9.md), [BT10](waves/BT10.md)); the head chef revises each against the preceding wave's Result before dispatching, and each cooks only when named. **No payment of any kind is implemented and no bounty site is used** (owner, 11 October 2026): every bounty states a reward of $0, and the kitchen is the solver in every real run. The repository is licensed under Apache 2.0 since 11 October 2026.

Carried findings for later waves (from BT6's pass and Part C): `lineCounts`' unpinned `git diff --numstat` is safe today but pin it for consistency; solver filenames can smuggle verdict words into `flag:`/`current code:` lines; `answer --pr` ran ~2.5 min silent — a progress line is a nit; the issue's folder-channel "how to answer" wording reads oddly on GitHub; solver-side return of generated artifacts (BT5 journey) and a `bounty look`/diff view (BT7) are already on the roadmap.

## Next

**BT7.** Send `START.md: BT7`.
