# Status

Updated by the CTO on 19 October 2026 at the K31 close.

## Now

- **K31 merged** (`8531fb8`; independent PASS test-verified on `776ee74`, verdict `81e03b8`). First real-use measurement (G9): 0 of 5 posting agents used `box bounty` — all judged their task plainly doable and did it directly, two quoting the tool's own "not worth it when: you can plainly do the work". No solvers ran; the loop was never entered. Report: `kitchen/reviews/K31-real-use.md`; transcripts and logs in `kitchen/memory/real-use/`.
- **Answers:** hand-off rate below the tool's advice threshold is 0/5 on small tasks; continuation agent answered both memory questions correctly (no open bounties, nothing owed — all $0); second machine read the shared memory fine (work-b fast-forwarded, records read). 3 of 5 posting agents never checked whether work was already handed off (M2 partly).
- **Harness caveat:** `source`-delivered env does not persist across subagent tool calls — some gh calls ran unlogged; transcript-derived counts are labelled in the report. Station lesson recorded.
- Sandbox clean: 0 open issues / 0 open PRs (baseline 0); only `main` + two pre-K31 `fix/*` branches; `cd62d1a`/`a33c175` on main are legitimate sandbox state. Scratch `%TEMP%\box-k31` removed; merged branch deleted.
- K35-K37 P2-P10 rollout and K34 P1 remain shipped. K31 post-push checks not awaited.

## Next

This run stops after K31. No wave is in flight. Real-use finding: next experiment must size tasks above the worth-it threshold, or hand-off rate keeps measuring zero. K30 remains available; BT33 parked; BT12 Part B deferred.
