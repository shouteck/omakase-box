# Status

Updated by the CTO on 18 October 2026 at the K28 close.

## Now

- **K28 merged** (`ce20e1c`; independent PASS test-verified on `dfe1789`, verdict `a12d97d`). Research, scripts and evidence only; no product or test changes. Final reviewer invocation of `node scripts/verify.mjs test:kitchen` exited 0 on that exact candidate, reusing its recorded 83-test PASS.
- **Recommendation, not approval:** per-bounty event chains under custom Git refs, with local SQLite as a rebuildable cache. Local prototype reproduced concurrent merge without lost events, deleted-ref recovery and a default clone without chains. Timings are local `file://`, not GitHub evidence.
- **Validation partial:** chain-backed agent 6 right / 2 partly / 0 wrong; issues-only 3 / 2 / 3. The all-right bar was not met. Historical job state was missing from the fixture; the similarity question was ambiguous. No participant rerun.
- Other-session roadmap and approved living memory specification preserved from `origin/master` (`df919de`), along with the later autonomy update and K32 brief (`b071c79`). K28 checked against the memory specification in its close record. K28 scratch and the explicitly approved `box-k6-lockfile-cache` removed; main checkout is master. The owner explicitly authorized publication to the existing origin.
- BT31 and BT31-ci remain merged: local SQLite, Node >=22.13.0, plain substring search without FTS5. Latest completed hosted run read before merge was green (`39049373083`).

## Next

No wave is in flight, and this run stops after K28. **BT32 remains on hold**. Its proposed replacement outline is in `kitchen/reviews/K28-delegation-record.md`, not permission to dispatch the old issue-based brief. Before implementation, reconcile the outline with `docs/box-v4/MEMORY-SPEC.md`, repair the experiment gaps and prove the required GitHub behavior under an approved live brief. The roadmap's other briefs remain available but none starts in this run. **BT33** stays parked; **BT12 Part B** stays deferred.
