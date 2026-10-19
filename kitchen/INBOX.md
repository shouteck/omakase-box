# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- K39: `box bounty create` misses `<1s @ 10k files` (~20.6 s median on Windows) and fails 5/5 at 100k files with `ENOBUFS` because `snapshot.ts:70` (`git ls-tree -r -z`) calls `git.ts:204` without `maxBuffer` (1 MiB default). Needs a product fix wave (or recalibrated Windows target + `maxBuffer` fix).
