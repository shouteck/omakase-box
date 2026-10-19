# K31b — dispatch timings

Wall times are each agent's own `date -u` readings from its verbatim report
(all agents ran `date -u`; every report is UTC — K31's timezone fix held).
Host: Windows 16 GB; no unusual load observed. The dispatch windows are the
attribution key for the shared `gh-logs/machine-a.jsonl` log: a gh line
belongs to the agent whose window contains its (normalised) timestamp.

| agent | dispatched (UTC) | returned (UTC) | wall | report file |
|-------|------------------|----------------|------|-------------|
| post-a1 | 06:22:49 | 07:09:30 | ~47 min (mostly polling) | post-a1.txt |
| solve-a1 | 07:10:15 | 07:10:51 | 36 s | solve-a1.txt |
| cont-a1 | 07:11:13 | 07:20:02 | ~9 min | cont-a1.md |
| post-a2 | 07:20:51 | 08:27:04 | ~66 min (mostly polling) | post-a2.txt |
| solve-a2a | 08:43:16 | 08:46:08 | ~3 min | solve-a2a.txt |
| solve-a2b | 08:46:32 | 08:47:23 | 51 s | solve-a2b.txt |
| cont-a2 | 08:47:49 | 08:49:25 | ~2 min | cont-a2.txt |
| post-a3 | 08:50:00 | 10:24:09 | ~94 min (mostly polling) | post-a3.txt |
| solve-a3 | 10:24:45 | 10:25:47 | 62 s | solve-a3.txt |
| cont-a3 | 10:26:13 | 10:27:26 | 73 s | cont-a3.txt |
| b1 | 10:28:06 | 10:30:25 | ~2.3 min | b1.txt |
| b2 | 10:31:20 | 12:19:07 | ~108 min (mostly polling) | b2.txt |
| b3 | 12:19:47 | 12:20:36 | 49 s | b3.txt |
| work-b | 12:21:06 | 12:25:33 | ~4.5 min | work-b.txt |
| cook cleanup (status, look 38, apply 38) | ~12:30–12:31 | | ~1 min | this file + gh log |

GitHub stage times (UTC, `createdAt`/`closedAt`):

| stage | A1 | A2 | A3 | B2 |
|-------|----|----|----|----|
| issue posted | 06:23:30 (#28) | 07:21:39 (#30) | 08:50:47 (#33) | 10:32:10 (#36) |
| solver PR open | 07:10:48 (#29) | 08:46:02 (#31), 08:47:19 (#32) | 10:25:43 (#34) | 12:24:59 (#38) |
| issue closed | 07:12:10 | 08:48:36 | 10:26:59 | 12:31:25 |
| PR(s) closed | 07:12:14 | 08:48:40, 08:48:42 | 10:27:03 | 12:31:29 |

post → solver-PR gaps (~47 min, ~84 min, ~95 min, ~113 min) measure dispatch
latency + solver runtime, not GitHub: solvers were dispatched by the head
chef after the posting agent's session ended. Solver wall time alone was
36 s – 3 min per task. B2's gap includes the ~108 min b2 poll plus the gap
to work-b's dispatch.
