# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- Version the measurement driver and gate every child launch on experiment run cap, clean exact SHA and cheap smoke/type checks; stop on the first failed child. K7 ran12full attempts against10allowed because its ignored batch driver enforced neither cap nor fail-fast.
- k6-scoped-tmp ownership/refusal remains on parked unmerged K7, not delivered on master; keep the mandatory populated-foreign-path refusal requirement when resuming.
