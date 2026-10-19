# K31 — dispatch timings

One row per agent. Wall times recorded by the head chef at dispatch and
hand-off; stage times on GitHub are pulled from `createdAt`/`closedAt`
after each run and cross-checked here. Host: Windows 16 GB; note CPU load
when a duration looks off (evidence card: load is part of the measurement).

No solver rows were ever dispatched — nothing was posted, so no bounty had
a URL to hand out. Wall times are the agents' own transcript readings;
timezones differ between reports (post-t2/t3/t4 in MPST ≈ UTC+8, post-t5 in
+0800, the rest UTC) — normalised to UTC below, original noted.

| agent | dispatched (UTC) | returned (UTC) | wall (UTC) | transcript saved |
|-------|------------------|----------------|------------|------------------|
| post-t1 | ~05:41 | ~05:43 | ~15 s (05:41:40–05:41:55, agent clock) | yes |
| post-t2 | ~05:42 | ~05:43 | ~52 s (13:42:23–13:43:15 MPST) | yes |
| post-t3 | ~05:43 | ~05:45 | ~1–2 min (13:43–13:45 MPST, agent approximate) | yes |
| post-t4 | ~05:44 | ~05:46 | ~2 min (~13:44–13:45:48 MPST) | yes |
| post-t5 | ~05:44 | ~05:47 | ~3 min (~13:44–13:47 +0800) | yes |
| cont-a | ~05:45 | ~05:49 | ~4 min (~05:45–05:49) | yes |
| work-b | ~05:46 | ~05:49 | ~3 min (~05:46–05:49) | yes |

Head-chef dispatch notes (verbatim from the original rows): post-t1 "no
bounty posted (agent fixed directly)"; post-t2 "no bounty posted (direct
fix committed a33c175 on machine-a main)"; post-t3 "no bounty posted
(README updated, uncommitted)".

Commit/push times on the sandbox remote (git committer date, UTC+8 shown
as committed): `a33c175` 2026-10-19T13:43:09+08:00 (post-t2, `--list`),
`cd62d1a` 2026-10-19T13:46:55+08:00 (post-t5, T1+T3+T4 bundle, pushed to
origin/main).
