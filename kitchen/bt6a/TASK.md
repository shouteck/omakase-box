Finish quoting solver-supplied paths in the fact report.

`packages/box-bounty/answer.ts` builds a report of facts about a returned
solution. Solver-controlled filenames reach two lines verbatim, so a filename
like `tests/should accept.py` or `tests/safe and correct.py` smuggles the
words "accept", "safe" and "correct" into the tool's own prose — lines a later
agent reads as the tool's statements.

A helper already exists and is already used on the conflict line:

    const showPath = (path: string): string => JSON.stringify(path);
    // applied at the "current code: … would conflict in …" line

The job: apply `showPath` to every remaining place a solver-supplied path
reaches a report line — the `flag:` lines built in `attemptFlags` (the
test-path flag joins `testLike` verbatim; check the size flag too), and any
other report surface that embeds a solver path in the tool's prose. Keep the
quoted form consistent everywhere.

Then prove it: extend the banned-words test in `tests/box/bounty/report.test.ts`
(the `BANNED` regex block) so an answer touching a solver-named path like
`tests/should accept.py` still produces a report that does not match —
and, in the same test or a new one, assert a quoted path cannot break out of
the prose (e.g. a filename containing a double quote or a newline shows
JSON-escaped, not raw). Match the test file's existing style. Change nothing
else.
