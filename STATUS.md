# Status

Replaced by the CTO on 10 October 2026, at the close of wave BT2.

## Now

- **BT2 is done and merged** (`3d38544`, PASS ui-verified): `box bounty` now remembers. `create` writes `.box/bounties/<id>.json` in the project and pins `snapshot.commit` under `refs/box-bounty/<id>` so `gc` cannot take it; `status` lists every open bounty with its stage and next step; `confirm` records the owner's yes; `post --to <dir>` delivers a copy to a local folder only after it; `withdraw` ends one and frees the ref. `.box` is a never-ship segment, so records never ride inside a later bounty. 17 new tests, all must-fail cases live-probed.
- **Known limits for later:** `--to` naming a *nonexistent* path under a junction can still land inside the checkout (same class as BT1's `--out` residual; fix direction recorded: realpath the nearest existing ancestor); the record is a JSON convention, not confinement — an agent can hand-edit `stage` to `confirmed`, though forgery leaves a visible gap in events; `status` outside a checkout says "bounty create needs a repository" (wrong verb in the message); plus the BT1 set — `secrets` basename over-removal, untracked-via-junction live bytes, git-lfs pointer stubs.
- **The off-machine run now tests the product.** Every code push runs the bounty, trace and package suites on pinned `ubuntu-24.04` (K10). Whether to keep the 14 earlier-platform suites off-machine (~3.1 min + ~1 min Chromium) is the owner's open call.
- **Milestone BT is approved** (BT1 to BT6); BT1 and BT2 are merged. Each wave cooks only when the owner names it, and the kitchen stops after each. BT6 needs a separate approval and a choice of site.
- **C1's `box trace` is kept but not used by milestone BT.** The smaller Box is a later decision.
- **The lab is paused entirely.** Do not read its brief, answer it or run a sync.
- **Left as they are, not merged and not deleted:** local branches `wave/A6` and `wave/K7`. Deleting an unmerged branch is the owner's call.
- Master is clean and published. Nothing is running.

## Off-machine checks (looked at by the CTO on 10 October 2026)

- Green on `wave/K10` before merge (run 38016413100, product suites visibly executed); the K10 merge run on master was in progress at BT2 kickoff — read the latest result before the next merge.

## Next

**BT3: return.** Take an answer back: verify it against the version it was made for, bring it forward onto current code, apply it, or reject it with a reason — then say what job is waiting on it. Reuses the existing verify. No brief yet — the CTO writes it when this wave is named. Send `START.md: BT3`.
