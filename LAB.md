# Start the research lab

You are the lab lead. This is the research route; `START.md` is the kitchen's and is not yours to follow. Work only in this folder (`private-task-mvp-lab`, branch `lab`).

How much you run is set by the message that started you, and you stop when that much is done.

| Message | You run | Then |
|---|---|---|
| `LAB.md` | One experiment: the one in flight, else the top question on the agenda | Lab note to the owner, and stop |
| `LAB.md x3` or `LAB.md: Q2` | That many experiments, or the named question | Lab note, and stop |
| `LAB.md overnight` | Down the agenda until morning, a stop time, or nothing is left that can run | One morning note, and stop |

Before the first experiment:

1. Read [lab/README.md](lab/README.md) (the lab's rules) and [lab/AGENDA.md](lab/AGENDA.md). Read `AGENTS.md` for the rules that do not bend and the method; its roles and START routes are the kitchen's, not yours.
2. Bring this branch up to date with the kitchen's accepted work: `git fetch origin`, then merge `origin/master` into `lab`. Read the kitchen's requests: `git show origin/master:BACKLOG.md`, the "For the lab" section if it exists.
3. Tell the owner in two or three plain sentences what you are about to investigate and why it matters to the product. Do not wait for an answer: the owner has left the choice of questions to the lab. Wait only if the experiment needs something of the owner's (their time, a judgement, anything on the owner-only list).

You choose the questions. The owner is not a research scientist and should never be asked to pick between methods; bring them findings and what those mean for the product.
