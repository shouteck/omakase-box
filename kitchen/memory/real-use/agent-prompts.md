# K31 — agent prompts, verbatim

Frozen 19 October 2026. Each prompt below is the COMPLETE prompt for one
fresh agent — nothing may be added when dispatching, except the `<TASK>`
substitution in the posting prompts (the frozen task text from
`frozen-tasks.md`) and the `<ISSUE-URL>` substitution in solver prompts.
No prompt names a `box` subcommand beyond "box bounty" itself, names a gh
command, or hints at the expected journey — that would change the
experiment. Environment lines are wiring, identical in kind to K26's.

Paths used below:

- `MACHINE_A` = `C:\Users\shout\AppData\Local\Temp\box-k31\machine-a`
- `MACHINE_B` = `C:\Users\shout\AppData\Local\Temp\box-k31\machine-b`
- `ENV` = `/c/Users/shout/AppData/Local/Temp/box-k31/env`
- `SOLVER_DIR` = `C:\Users\shout\AppData\Local\Temp\box-k31\solver-<NAME>`

Dispatch order recommended to the head chef (state at the time matters to
the findings): post-t1, solvers t1a+t1b, cont-a to merge, then post-t2 →
solve-t2 → cont-a, post-t3 → solve-t3, post-t4 → solve-t4 (needs T1's fix
merged first or its constraint is unsatisfiable — that itself is data),
post-t5 → solve-t5, then work-b last, once the merged memory exists.

## Posting agent — one per task (post-t1 … post-t5), machine A

    You are a coding agent working on a small project.

    Work only inside C:\Users\shout\AppData\Local\Temp\box-k31\machine-a.
    Before anything else, run this once in your shell so the environment
    is set up:

      source /c/Users/shout/AppData/Local/Temp/box-k31/env/activate-post-t<N>.sh

    Your task, in the project owner's words:

    "<TASK>"

    The tools here include `box bounty`; use them if they help.

    When you are done, write a plain-text report: the time you started,
    every command you ran in order, what you decided at each step and why,
    anything that confused you or that a tool got wrong, and the time you
    finished.

## Solver agents — one per posted bounty (solve-t1a, solve-t1b, solve-t2 … solve-t5)

    You are a coding agent.

    Work only inside the empty folder
    C:\Users\shout\AppData\Local\Temp\box-k31\solver-<NAME>. Before
    anything else, run this once in your shell so the environment is set
    up:

      source /c/Users/shout/AppData/Local/Temp/box-k31/env/activate-solve-<NAME>.sh

    Solve this bounty: <ISSUE-URL>

    When you are done, write a plain-text report: the time you started,
    every command you ran in order, how you understood the task, anything
    that was unclear, and the time you finished.

## Posting agent again, later session (cont-a) — run after each merge cycle

    You are a coding agent continuing work on this project.

    Work only inside C:\Users\shout\AppData\Local\Temp\box-k31\machine-a.
    Before anything else, run this once in your shell so the environment
    is set up:

      source /c/Users/shout/AppData/Local/Temp/box-k31/env/activate-cont-a.sh

    Continue your work in this project.

    When you are done, write a plain-text report: the time you started,
    every command you ran in order, what you found had changed since you
    last worked, what you did about it and why, anything that confused
    you, and the time you finished.

## Later agent, machine B (work-b)

    You are a coding agent continuing work on this project.

    Work only inside C:\Users\shout\AppData\Local\Temp\box-k31\machine-b.
    Before anything else, run this once in your shell so the environment
    is set up:

      source /c/Users/shout/AppData/Local/Temp/box-k31/env/activate-work-b.sh

    Continue the work in this project.

    When you are done, write a plain-text report: the time you started,
    every command you ran in order, what you found in the project, what
    you understood about work already done and work still open, anything
    that confused you, and the time you finished.

## The age and paid questions — appended to the last cont-a session (or a fresh agent on machine A)

    Two questions before you finish: which bounties are still waiting,
    and was anyone owed payment?

    Answer in the same plain-text report.

## Capture

- The head chef saves each agent's full session transcript verbatim to
  `kitchen/memory/real-use/transcripts/<agent-name>.md` at hand-off, and
  records dispatch and return wall-clock times in `timings.md`.
- `gh` process starts: every agent's activate file puts a logging `gh`
  shim first on PATH; each start appends one JSON line (timestamp, cwd,
  args) to `gh-logs/<agent>.jsonl`. The shim execs the real gh unchanged.
  Fallback when an agent's shell lost the environment: count `gh `
  invocations from its transcript; flag the count as transcript-derived.
- `box` internals' gh calls are counted too — the `box` wrapper prepends
  the same shim dir to PATH before exec.
- Stage wall times on real GitHub come from `createdAt`/`closedAt` on the
  issues and PRs (pulled with `gh api`/`gh issue view` after each run)
  cross-checked against transcript times.
