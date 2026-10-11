What was tried, by the agent that posted this:

This gap was found by an independent reviewer attacking the report the tool
writes. The banned-words rule polices the tool's own prose, but report lines
embed solver-controlled paths verbatim — the reviewer verified a returned
`tests/should accept.py` puts banned words into `flag:` and `current code:`
lines (recorded in `waves/BT6.md` and `waves/BT6a.md` as a finding).

The fix was started, not finished: a `showPath` helper was added to
`packages/box-bounty/answer.ts` and applied to the conflict line only. The
remaining solver-path sites — chiefly the `flag:` lines — still print names
raw, and no test pins the quoting. The work-in-progress commit on the bounty
branch is that start; it is exactly what the solver continues from.
