# K31b — dispatch timings

One row per agent. Wall times recorded by the head chef at dispatch and
hand-off (UTC — ask each agent to run `date -u` once; K31's timezone drift
fix). Stage times on GitHub are pulled from `createdAt`/`closedAt` after
each run and cross-checked here. Host: Windows 16 GB; note CPU load when a
duration looks off (evidence card: load is part of the measurement).

The dispatch windows in this table are also the attribution key for the
shared `gh-logs/machine-a.jsonl` / `machine-b.jsonl` logs: a gh line
belongs to the agent whose window contains its timestamp.

| agent | dispatched (UTC) | returned (UTC) | wall (UTC) | transcript saved |
|-------|------------------|----------------|------------|------------------|
| post-a1 | | | | |
| solve-a1 | | | | |
| cont-a1 | | | | |
| post-a2 | | | | |
| solve-a2a | | | | |
| solve-a2b | | | | |
| cont-a2 | | | | |
| post-a3 | | | | |
| solve-a3 | | | | |
| cont-a3 | | | | |
| b1 | | | | |
| b2 | | | | |
| b3 | | | | |
| work-b | | | | |

Head-chef dispatch notes:

GitHub stage times (issue/PR `createdAt`/`closedAt`, UTC) — fill per task:
