# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.
- BT100 (24 November 2026): a CLI-driven test runs whatever `dist` holds; the test build typechecks tests, so one type error leaves an old CLI behind silently. Candidate: `suite.mjs` refuses a CLI-driven run when the build's exit was non-zero or `dist` is older than its sources.
