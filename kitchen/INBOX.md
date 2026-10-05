# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- Verify took 120 of 398 minutes on the 5 October night run; 37 were exact repeats on a commit that had already passed, and `check` was 45 (26 runs at ~106 s) -> waves K5, K6, K7, measured one at a time.
- Once verify is fast: property-based tests for the guards the pass attacks by hand, and mutation checks on Box packaging tests, to raise what the tests catch rather than how fast they run.
- No one reads the verify numbers; generate a one-page summary from `.kitchen/runs` and Git -> wave K4.
- Stall rules rely on the stuck agent's own judgement; have verify count consecutive non-PASS runs and elapsed time on a branch and say "park" -> wave K4.
- Compare against upstream pstack about once a month for new principles and playbooks (last done 5 October 2026, upstream at 0.15.10).
