# Kitchen inbox

Kitchen-wide lessons and ideas, one line each, ten at most. Only the head chef writes here. Emptied at every kickoff: each line is adopted or dropped. See "Getting better" in docs/box-v4/KITCHEN.md.

- Make k6-scoped-tmp invocation-owned and refuse unrelated populated occupants before cleanup; its pre-existing fixed-directory rmSync hazard remains. K7-ci2 fixes junction cleanup with link-only unlink and refusal tests, not this separate fixture.
