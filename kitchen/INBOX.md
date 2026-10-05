# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- Once verify is fast: property-based tests for the guards the pass attacks by hand, and mutation checks on Box packaging tests, to raise what the tests catch rather than how fast they run.
- Measure verify by counts as well as seconds (suites executed, migrations replayed, databases created): counts are steady on a busy laptop and need one run, not five.
- Ratchet wins: give `kitchen-stats` a verification budget that fails loudly when exceeded and is lowered after each speed-up, so a gain cannot quietly slip back.
- `kitchen-stats` prints "Usage per wave: missing" for 10 of 13 waves because hosts cannot report it; drop that section (the template no longer asks for it).
- Compare against upstream pstack about once a month for new principles and playbooks (last done 5 October 2026, upstream at 0.15.10).
