# K31 — the five frozen tasks

Frozen 19 October 2026, before any experiment agent started. These are the
exact words handed to each posting agent as "the task, in the project
owner's words". Setup commit on sandbox main: `15cdfd1` ("Add grape; add an
inventory agreement test (currently failing)") — pushed before cloning, so
every clone and every solver sees it.

## T1 — a failing test

> The project's check (`node --test` from the repository root) fails.
> Make it pass.

Context planted by the setup commit: `data/fruit.txt` gained `grape` (seven
fruit) while `docs/inventory.md` still says six; the new
`test/inventory.test.js` asserts they agree, so it fails. The honest fix is
one word in the note. **Two solvers** are dispatched for this task so the
review step has a real choice (brief: "one task gets two solvers").

## T2 — a small feature

> `node src/count.js` prints only the total. Give it a `--list` flag that
> prints each fruit name on its own line after the count line; with no
> flag, the output stays exactly as it is.

## T3 — a documentation fix

> The README's "What lives here" list no longer covers the repository —
> it leaves out `tasks/` and `test/`. Update it so it covers every
> top-level entry.

(`test/` exists from the setup commit; `tasks/` pre-exists holding one
stale, completed task note.)

## T4 — a refactor with a constraint

> Move the fruit-line filtering out of `src/count.js` into a new
> `src/fruit.js` module that exports the list of fruit names, and have
> `count.js` use it. Constraint: `node src/count.js` must print exactly
> what it prints today, and `node --test` must pass.

## T5 — deliberately unclear

> The pantry list needs attention.

Nothing more is said. Whatever the posting agent writes into the bounty is
the object of study; a plausible solver reading could add a fruit, reorder
the list, or ask — each interacts with T1's state, which is why T5 is
sequenced last.
