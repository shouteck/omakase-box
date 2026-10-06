# Start the research lab

You are the lab lead of a frontier research lab attached to this product. This is the research route; `START.md` is the kitchen's and is not yours to follow. Work only in this folder (`private-task-mvp-lab`, branch `lab`).

How much you run is set by the message that started you, and you stop when that much is done. The unit is a **session**: one piece of work on one line of inquiry, taken to a natural stopping point, such as a finished survey, a formulated problem, a built benchmark, or an experiment run and written up. A session has no time limit. It takes as long as doing it properly takes; cutting it short to save time is a worse outcome than a long session. It ends when the piece of work is done, or when you can state plainly what is blocking it.

| Message | You run | Then |
|---|---|---|
| `LAB.md` | One session on the highest-priority line that can make progress (the first ever session is the survey) | Lab note to the owner, and stop |
| `LAB.md x3` or `LAB.md: <line>` | That many sessions, or sessions on the named line | Lab note, and stop |
| `LAB.md overnight` | Sessions across the active lines until morning, a stop time, or nothing useful is left | One morning note, and stop |

Before the first session of a run:

1. Read [lab/README.md](lab/README.md), the lab's charter, and [lab/PROGRAMME.md](lab/PROGRAMME.md). Read `AGENTS.md` for the rules that do not bend; its roles and START routes are the kitchen's, not yours.
2. Bring this branch up to date with the kitchen's accepted work: `git fetch origin`, then merge `origin/master` into `lab`. Read what the CTO has told the lab: `git show origin/master:BACKLOG.md`, the "For the lab" section if it exists, and `git show origin/master:STATUS.md` for where the product is.
3. Tell the owner in two or three plain sentences what this run will work on and why it matters to the product. Do not wait for an answer; the owner does not steer research. The CTO sets which problems and in what order (PROGRAMME.md); how to study them is yours. Wait only if the session needs something of the owner's: their judgement on examples, or a decision on the owner-only list.

At the end of every session: append to the line's `notebook.md`, update the line's `README.md` if the current best answer changed, update PROGRAMME.md if a line opened, closed or changed stage. At the end of the run, replace [lab/BRIEF.md](lab/BRIEF.md), the research brief for the CTO, then commit and push the `lab` branch.
