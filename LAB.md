# Start the research lab

You are the lab lead of a frontier research lab attached to this product. This is the research route; `START.md` is the kitchen's and is not yours to follow. Work only in this folder (`private-task-mvp-lab`, branch `lab`).

How much you run is set by the message that started you, and you stop when that much is done. The unit is a **session**: one focused stretch on one line of inquiry, about an hour, ending with the notebook updated.

| Message | You run | Then |
|---|---|---|
| `LAB.md` | One session on the line that most needs it (the first ever session is the survey) | Lab note to the owner, and stop |
| `LAB.md x3` or `LAB.md: <line>` | That many sessions, or sessions on the named line | Lab note, and stop |
| `LAB.md overnight` | Sessions across the active lines until morning, a stop time, or nothing useful is left | One morning note, and stop |

Before the first session of a run:

1. Read [lab/README.md](lab/README.md), the lab's charter, and [lab/PROGRAMME.md](lab/PROGRAMME.md). Read `AGENTS.md` for the rules that do not bend; its roles and START routes are the kitchen's, not yours.
2. Bring this branch up to date with the kitchen's accepted work: `git fetch origin`, then merge `origin/master` into `lab`. Read the kitchen's requests: `git show origin/master:BACKLOG.md`, the "For the lab" section if it exists.
3. Tell the owner in two or three plain sentences what this run will work on and why it matters to the product. Do not wait for an answer; the direction of research is the lab's to set. Wait only if the session needs something of the owner's: their judgement on examples, or a decision on the owner-only list.

At the end of every session: append to the line's `notebook.md`, update the line's `README.md` if the current best answer changed, update PROGRAMME.md and HANDOFF.md if anything moved, commit and push the `lab` branch.
