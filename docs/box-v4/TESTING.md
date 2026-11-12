# How we write tests for this tool

Written by the CTO on 12 November 2026 from the evidence in [K51](../../kitchen/reviews/K51-tests.md) to [K65](../../waves/K65.md): the suite grew one wave at a time, mostly as one real repository per test; 31% of the bounty tests take 82% of the time; and a pilot ([K65](../../waves/K65.md)) showed the same guard tested as data plus one repository is about four to five times cheaper (13 tests at 9.9 s against 70 at 2.2 s, start-up included) and catches more. Sources and their limits are in [K51d](../../kitchen/reviews/K51d-how-we-test.md). The cost argument is about the shape of the tests, not any machine: a repository per spelling grows with every spelling on every system.

## What a test is for

A test defends a **guarantee** or pins a **bug that happened**. It is not there to raise coverage. Every guarantee has an id in [CONTRACTS.md](CONTRACTS.md); the test that proves it says so in a comment line above it, `// @guards P1 R3`, and `node scripts/proof-map.mjs --check` (run by every verify) fails when a hard-stop guarantee has no test or an id is wrong. A test with no guarantee behind it needs a reason in its title: the bug it pins, or the fact it fixes.

## Three levels, and the rule for choosing

1. **The rule as data.** If the decision is a function of its inputs (a path matcher, a failure classifier, a parser, a fold, a settings gate's decision), test it as a pure function: a table of input and expected answer, and a seeded property where the input space is large (case, prefixes, invisible characters, look-alikes). Cases cost nothing; add a row for every spelling or bug. Example: `tests/box/bounty/never-ship-layers.test.ts`, `bt50.test.ts`.
2. **The plumbing, once.** The code that gets inputs to the rule (enumerating files, reading the owner's settings, the record, Git, `gh`) is tested with **one shared world** per file or per route set that holds a case for every route, and many assertions over it. A world is a repository, a remote, a stand-in `gh`: tens of Git starts. Build it once, not once per spelling.
3. **A journey.** The real tool, end to end, a few per command family, each with the evidence (output, exit code, what was written). They prove the pieces meet; they are not where a rule's cases live.

**Choose the lowest level that can fail for the reason being tested.** Asking "does the rule name this path?" at level 3 is a repository per answer. **Do not test one property through every door:** if a formatter is shared, test it once as data and each door once for "it uses the formatter".

## The cost model

A command is 13 to 24 child starts (Git, `gh`), so a test costs about its commands times that, and a world costs tens more ([K51c](../../kitchen/reviews/K51c-where-the-time-goes.md)). Count the commands before adding a test that runs many; prefer one assertion block over repeated setups.

## Red first, and breaking to prove

- **A new test is seen failing** before the code that makes it pass, on the old code (the kitchen's rule), or, for a test added over existing behaviour, by **breaking the code one place at a time** and watching it go red ([K65-breaks.md](../../kitchen/reviews/K65-breaks.md)): a test that passes on the broken code proves nothing.
- **A test is replaced or removed only with a break proof:** for every one-place break of the code, if the old test is red, a remaining test is red too. List each in the wave file under `## Changed expectations` with the reason; `verify` refuses otherwise ([K62](../../waves/K62.md)).
- **Never** loosen a time limit or skip a test to make a run green; `.only` is never committed.

## Hard stops get both layers

Each hard-stop guarantee needs a level 1 test (the rule, as data) and a level 2 or 3 test (the plumbing reaches it), both tagged with its id. The rule can be right and the plumbing skip it; the plumbing can call the rule and the rule be wrong.

## Words

A test that pins a long string is a **change-detector** unless the words are the contract (the tool's text is an agent's interface, so some are). Assert the fact (a named reason, a field, a number) and pin the words only where they are the promise. Do not assert on text the code produced from the same text.

## Pitfalls met so far

- Two paths that differ only in case are one file on a case-folding file system (Windows, macOS): a test that creates both gets different answers on different systems. Use distinct names.
- A test that spawns the built tool needs the bundle rebuilt after a source change (`node scripts/workspace.mjs build`).
- A stand-in (`gh`, the board, a payment provider) is the test's belief about a service; nothing yet checks it against the real one ([K51d](../../kitchen/reviews/K51d-how-we-test.md) H10).
