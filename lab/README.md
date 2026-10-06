# The research lab

The kitchen delivers known work. The lab answers open questions the product depends on, where the honest result may be "this does not work". The lab produces findings; the kitchen turns adopted findings into product.

| | Kitchen | Lab |
|---|---|---|
| Output | Merged, tested code | A finding and a recommendation |
| Done when | Tests pass on a commit | The question is answered with evidence, including "no" |
| Failure | A problem | A valid result, recorded |
| Code | Kept | Thrown away; only the idea survives |

## People

- **Lab lead:** owns the agenda, designs experiments, writes findings and lab notes. [roles/researcher.md](roles/researcher.md).
- **Researcher:** runs one experiment. Same role file; on a small experiment the lab lead does this itself.
- **Sceptic:** a fresh agent that tries to reproduce the result and break the conclusion. Never the agent that ran the experiment. [roles/sceptic.md](roles/sceptic.md).

Staff them the way `kitchen/README.md` describes for any host: a named profile if the host has one, otherwise a fresh agent given the role file and the experiment file.

## How an experiment runs

1. **Question.** Take it from [AGENDA.md](AGENDA.md). It must name the product decision it informs.
2. **Read first.** These are studied problems. Before designing anything, find what is already known (papers, documented systems, prior experiments here) and cite it in the experiment file. Do not rediscover a published result at the owner's expense.
3. **Write the experiment file before running it**, from [templates/experiment.md](templates/experiment.md): hypothesis, method, the measure, and what result would count as yes, as no, and as inconclusive. Deciding this afterwards is not research.
4. **Run it** in `lab/experiments/<id>/`. Prototype code is throwaway and stays on this branch.
5. **Sceptic.** A fresh agent reruns the key measurement from the recorded steps and attacks the conclusion.
6. **Finding.** One page in `lab/findings/<id>.md`: what was asked, what was found, how sure, what it means for the product, and one recommendation: **adopt**, **drop** or **dig further**.
7. **Hand off.** Adopted findings and any request to the kitchen go in [HANDOFF.md](HANDOFF.md). Update the agenda. Commit and push this branch.

## Standards

- A number comes with its run count, its spread and what limits it. One run is an anecdote; say so.
- Negative and inconclusive results are recorded with the same care as positive ones.
- Counts over stopwatches where possible; this machine is shared and timings are noisy.
- Separate what was observed from what is inferred. Never claim customer value, novelty or generality from a lab result.
- An AI judging something (a design, a screenshot, a piece of writing) is a measuring instrument. Before its verdicts are used, measure how often it agrees with the owner on examples the owner has labelled, and report that agreement with the result.
- The pstack method applies: investigation, prototype, hillclimb and eval playbooks; explain-the-number, prove-it-works, exhaust-the-design-space.

## Cost: zero

No paid services, paid models, paid APIs, cloud machines or purchases, whatever the reason. Use what the session already includes (the agent's own reasoning and vision, web reading where the host has it) and free, open-source tools. A free dependency may be installed inside this folder only, and is recorded in the experiment file. If a question cannot be answered at zero cost, say so in the finding and stop; that is the owner's decision.

## Working beside the kitchen

The lab runs at the same time as the kitchen. It must never be the reason a kitchen wave fails or slows.

**Nothing shared in Git.**

- Work only in this folder and only on branches named `lab` or `lab/...`. Never write to `master`, to a `wave/...` branch, or to the main checkout at `private-task-mvp`. Never run a Git command there that changes anything.
- The lab never merges into master. An adopted finding is rebuilt by the kitchen as a normal reviewed wave.
- Reading the kitchen is always fine: `git show origin/master:<path>`, or reading files in the main checkout.

**One heavy job at a time on this machine.** A heavy job is anything that installs packages, builds, runs a test suite, starts a database or opens a browser. Before each one:

- Run `node lab/tools/kitchen-busy.mjs`. If it prints `busy`, the kitchen is verifying: wait and ask again in a minute, and meanwhile do work that is not heavy (reading, analysis, writing).
- If it is still busy after fifteen minutes, carry on with other work and come back later. Never race the kitchen.
- Light work (reading, thinking, small scripts under a minute) runs any time.
- Use your own temp directories, prefixed `lab-`, and let the system pick free ports. Never bind 4000, 4001 or the addresses the kitchen's tests use. Remove what you created when the experiment ends.

**Talking to the kitchen.**

- Lab to kitchen: [HANDOFF.md](HANDOFF.md) on this branch. The head chef reads it at kickoff.
- Kitchen to lab: the "For the lab" section of `BACKLOG.md` on master. The lab lead reads it at every start.
- If an experiment truly needs the kitchen to change something (a hook in the product, a fixture, a measurement recorded during waves), ask in HANDOFF.md and continue with what does not depend on it. Do not make the change yourself.

## Talking to the owner

One lab note per run, under 150 words, plain language:

> **Lab note: <question in one line>**
> **Found:** the answer, in a sentence or two.
> **How sure:** what it rests on, and its limits.
> **For the product:** what this changes, if anything.
> **Next:** adopt / drop / dig further, and what the lab does next.

Methods, citations and numbers stay in the finding. Ask the owner only for what only they can give: a judgement on examples, or a decision on the owner-only list.
