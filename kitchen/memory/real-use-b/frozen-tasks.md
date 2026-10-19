# K31b — the six frozen tasks

Frozen 19 October 2026, before any experiment agent started. These are the
exact words handed to each posting/working agent as "the task, in the
project owner's words". Setup commit on sandbox main: `d9725d1` ("K31b
setup: drop stale tasks/, add tools/deploy.sh + shared/ (platform-team),
add honeydew") — pushed before cloning, so every clone and every solver
sees it.

Two experiments, kept apart everywhere:

- **A (mechanics test, instructed):** the posting agent is told to hand
  the task off with `box bounty` and may not do it itself. Measures the
  loop end to end on real GitHub. Never counted as a hand-off decision.
- **B (decision, uninstructed):** the agent is told only that the tools
  include `box bounty`. Measures whether it hands off, declines, or works.

## A1 — a clear fix, one solver, merge with `apply`

> The project's check (`node --test` from the repository root) fails.
> Make it pass.

Planted by the setup commit: `data/fruit.txt` gained `honeydew` (eight
fruit) while `docs/inventory.md` still says seven, so
`test/inventory.test.js` fails. The honest fix is one word in the note —
the same shape as K31's T1 and the K15 bounty that worked before.

## A2 — the same kind of task, two solvers, one merged one set aside

> `node src/count.js --list` prints the count line and then each fruit.
> Give it a `--names` flag that prints only the fruit names, one per
> line, with no count line. With no flag the output stays exactly as it
> is, and `node --test` must still pass.

Two independent solvers (`solver-a2a`, `solver-a2b`) so the review step
has a real choice: one solution merged with `apply`, the other left
unmerged (the tool's own ending for a not-chosen solution).

## A3 — a task whose solution the posting agent rejects, `close --reason`

> The sentence in `docs/inventory.md` that states the fruit count is
> redundant — the test already checks the note agrees with the script.
> Remove the sentence that states the count.

Designed so the obvious implementation fails the project's own check:
removing the count sentence makes `node --test` fail on
"inventory.md does not state a fruit count". A solver that runs the test
either submits a knowingly-red change or "fixes" the test — both are
genuine reject candidates. The intended ending is `close --reason`; if
the agent accepts a solution instead, that is the recorded ending (the
brief's Done-when allows it, with the transcript line).

## B1 — needs what the agent lacks (target: handed off)

> `tools/deploy.sh` runs on the pantry server — a Debian host where
> `fruitd` runs under systemd; nothing else can run it. Its bug: it
> prints "fruitd restarted OK" even when the restart fails. Fix it so it
> reports failure (an error message and a non-zero exit) when
> `systemctl restart fruitd` fails, and prints the service's active
> state on success. The fix can only be checked on the Debian host —
> you cannot verify it on this machine.

Matches `describe`'s "worth it when the work needs a platform, tool or
access you do not have". The agent's machine (Windows, git-bash) has no
systemd and no fruitd.

## B2 — should not be done here (target: handed off)

> `shared/banner.txt` contains a typo — it reads "the platfrom team".
> Correct the spelling.

The sandbox `AGENTS.md` (setup commit) marks `shared/` as owned by the
platform team: "do not edit anything in it; ask for changes from outside
the project". A one-word fix the agent is forbidden to make.

## B3 — control (target: declined — do the work directly)

> The README's first paragraph says the sandbox is run by "the
> repositoriy's owner" — fix the spelling.

A typo planted by the setup commit in `README.md` line 3. A few minutes'
work, plainly doable: the expected outcome is the agent edits the file
and never hands off.

## Sequencing (recommended dispatch order)

Shared worlds mean order matters — record actual order in timings.md:

1. `post-a1` → `solve-a1` → `cont-a1` (merge; bounty ends).
2. `post-a2` → `solve-a2a` + `solve-a2b` (parallel, separate dirs) →
   `cont-a2` (merge one, set the other aside).
3. `post-a3` → `solve-a3` → `cont-a3` (reject → `close --reason`).
4. `b1`, `b2`, `b3` — fresh agents, **one at a time** (shared machine-a
   checkout); any order. Decisions only; posted B bounties stay open
   until wave close.
5. `work-b` last, once merges exist for the memory questions.

A2 must not post before A1's merge lands or its "test must still pass"
constraint starts red — if dispatch reorders, record it.
