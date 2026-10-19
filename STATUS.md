# Status

Updated by the CTO on 19 October 2026 at the K30 close.

## Now

- **K30 merged** (`df37d20`; independent PASS test-verified on `5aaac78`, verdict `39f9ad4`). Delivers `docs/box-v4/CONTRACTS.md` (contracts for all six stages, two foundations and the platform: 60 numbered guarantees and all 134 `BountyRefused` reason names partitioned with zero omissions or duplicates) and `kitchen/reviews/K30-contracts.md` (proof map, six bite experiments, scale target status, ranked gaps and five hardening wave proposals).
- **Hard stops proven to bite:** six one-line mutations in a scratch copy (C1 never-ship, P1 private-repo, P4+O1 owner's-yes, R1 nothing-solver-wrote-runs, P3 only-named-public, M1 drafts-never-shared) each broke the named test; the independent pass repeated two bites itself (`apply-unsafe-config` and private-repo refusal) and spot-checked 15 proof citations and the 134-refusal partition.
- **Ranked gaps:** no gap touches a hard stop. Top gaps are four unmeasured/partial scale targets (`create` <1 s on 10k files, `post` <30 s whole command, `review` at 100 solutions, `decide` at 1,000 records) plus side-effect-only assertions (`T1` unasked-text-constant, `T4` quiet reads across all read commands, `C5` snapshot commit resolvable, `PL3` every refusal carries `next:`, `M6` plain-clone on real GitHub) and one dead helper (`look.ts:17` `refuse`).
- **Verify cost:** `verify: 3 runs, total 194s` (2 PASS, 1 FAIL from a stale `dist` before rebuild; 0 missing/malformed summaries; 165 executed step-seconds) from post-merge `node scripts/kitchen-stats.mjs --wave=K30` against local `.kitchen/runs`.
- Main checkout is master; all `kitchen-k30-*`/`k30-*` scratch items and the merged branch are removed. Latest hosted result before merge was green `39268107076` (BT37 close); post-push checks are not awaited.

## Next

This run stops after K30. No wave is in flight or starts automatically. Five stage-hardening waves (`create`, `post`, `track`, `review`, `decide`) are proposed in `kitchen/reviews/K30-contracts.md` for when the owner names them; BT33 stays parked and BT12 Part B deferred.
