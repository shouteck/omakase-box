# The research lab

A small frontier research lab attached to a product. The kitchen ships what is known how to build. The lab works on what is not known: problems where the field has partial answers, the right method is unclear, and "this does not work, and here is why" is a result worth having.

The lab's standing is earned the way any lab's is: by knowing the literature, measuring honestly, and being right more often than it is confident.

## What the lab is for

The product needs answers in a few problem areas (they are listed in [PROGRAMME.md](PROGRAMME.md)). The owner's and the CTO's ideas about how to solve them are hypotheses with no special standing; a published method that already works beats any of them. The lab's job is to find out what is true and hand the kitchen something it can build.

It produces three things, in this order of lasting value:

1. **Instruments:** benchmarks, labelled sets and evaluation harnesses that make a vague question measurable. These outlive any single result.
2. **Findings:** short memos stating a claim, the evidence, and the limits.
3. **Transfers:** a finding the kitchen adopts and rebuilds as product.

## How research is organised

Work is organised into **lines of inquiry**, not tasks. A line is one problem pursued over many sessions. Each line lives in `lab/lines/<name>/` and moves through these stages; skipping one is the commonest way to waste a month.

1. **Survey.** What does the field already know? Who has worked on this, under what names, with what results and what open problems? Written up as `related-work.md` with sources. If the problem is solved, say so and move to transfer.
2. **Formulate.** State the problem precisely enough to be wrong about it: definitions, what a solution must do, the metric, and what would count as progress. Vague problems produce unfalsifiable results.
3. **Instrument.** Build the benchmark before the method: a fixed set of cases with known answers, a harness that scores any approach on them, and a held-out part that is not looked at while developing.
4. **Baseline.** Run the simplest thing and the best published thing on the benchmark. A new idea means nothing until it is compared with these.
5. **Experiment.** One change at a time against the baseline, each written down before it is run.
6. **Write up and transfer.** A memo; then adopt, drop, or continue.

A line has a `README.md` (the problem, the metric, the current best answer and how sure), a `notebook.md` (append-only: every session, what was tried, what happened, including dead ends), and its benchmark and experiments.

## Culture

- **Know the field.** Reading is work, not preparation for work. Cite what you build on. Reinventing a published result is a failure of scholarship, however well executed.
- **Taste over volume.** Few lines, chosen because an answer would change what the product does. Prefer the experiment most likely to change your mind, and the cheapest one that could.
- **Strong opinions, held loosely, written down first.** State the hypothesis and the result that would refute it before running. Then follow the data.
- **Surprises are the point.** An unexpected result is investigated, not averaged away. Budget part of every session for following one.
- **Negative results are results.** They go in the notebook and the memo with the same care. A line closed for a good reason is a success.
- **Internal review is adversarial and impersonal.** The sceptic's job is to break the claim. A claim that survives is stronger; one that does not was never ready.
- **Calibrated language.** "Shows", "suggests" and "is consistent with" mean different things. Say how sure, and on what.
- **No demos.** A hand-picked example is an illustration, never evidence.

## The pstack principles, in a lab

The same principles the kitchen works by apply here, but they mean something different when the output is knowledge. Read the principle skills in `.devin/plugins/box-pstack/skills/principle-*/SKILL.md` and apply them in this sense:

| Principle | In the kitchen | In the lab |
|---|---|---|
| Prove it works | Run the real artifact | A result is real when a fresh agent reproduces it from the written method |
| Build the lever | Build the tool that does the job | Build the benchmark and harness; the instrument is what others rerun |
| Sequence verifiable units | Small waves, each checked | The smallest experiment that could change your mind; one variable at a time |
| Exhaust the design space | Prototype two or three designs | Competing hypotheses and published methods as baselines, on one benchmark |
| Explain the number | Trust a measurement only with its limiter | Variance, run count, what else it could be measuring, leakage from development into test |
| Attack the premise | Question the assumption behind failed fixes | Question the question: after two failed approaches, revisit the formulation |
| Laziness, subtract before you add | Smallest change, delete first | Simplest explanation, existing method first; invent only when the field has nothing |
| Model the domain | Name the data shape | Define the problem and the metric before any method |
| Fix root causes | Trace the bug to its cause | Explain anomalies; do not smooth them over |
| Test behaviour, not implementation | Assert observable results | Score outcomes on held-out cases, never a proxy that is easier to move |
| Make operations idempotent | Reruns converge | One command reruns an experiment: fixed inputs, recorded versions and seeds |
| Encode lessons in structure | Lessons become checks | Lessons become benchmark cases and harness checks |
| Guard the context window | Summaries, not payloads | Distil the survey; hand a researcher the memo, not forty papers |
| Never block on the human | Proceed on reversible work | The lab chooses its questions and methods; the owner is asked only for what only they can give |
| Experience first | User delight over convenience | Every line states what changes for the product's user if it succeeds |
| Outcome-oriented | Converge on the target | Drive to an answer; close lines that are not converging |

## People

- **Lab lead:** sets direction, chooses and closes lines, writes the programme and the lab notes, decides what is ready to transfer. Taste and honesty are the job. [roles/researcher.md](roles/researcher.md).
- **Researcher:** carries one line forward for a session. Same role file; on small steps the lab lead does this itself.
- **Sceptic:** a fresh agent acting as the hostile reviewer every paper deserves. Never the agent that produced the result. [roles/sceptic.md](roles/sceptic.md).

Staff them as `kitchen/README.md` describes for any host: a named profile where the host has one, otherwise a fresh agent given the role file and the line's files.

## Standards of evidence

- A number comes with its run count, its spread and what limits it. One run is an anecdote; say so.
- Development cases and held-out cases are kept apart. A method tuned on the test set has shown nothing.
- Compared things are given the same information, budget and checks, and the comparison says so.
- A model used as a judge is an instrument that must be calibrated: report its agreement with labelled human judgements, and its agreement with itself across runs, before using its verdicts.
- Separate what was observed from what is inferred. No claims of novelty without the survey to back them, and no claims about customers at all.

## Cost: zero

No paid services, paid models, paid APIs, cloud machines or purchases, whatever the reason. Use what the session already includes (the agent's own reasoning and vision, web reading where the host has it), open-access papers, and free open-source tools. A free dependency may be installed inside this folder only and is recorded in the notebook. Zero cost limits sample sizes; say what the limit was and what a larger study would need. If a question cannot be answered at zero cost, that is the finding.

## Working beside the kitchen

The lab runs at the same time as the kitchen and must never be the reason a kitchen wave fails or slows.

**Nothing shared in Git.**

- Work only in this folder and only on branches named `lab` or `lab/...`. Never write to `master`, to a `wave/...` branch, or to the main checkout at `private-task-mvp`. Never run a Git command there that changes anything.
- The lab never merges into master. A transferred finding is rebuilt by the kitchen as a normal reviewed wave.
- Reading the kitchen is always fine: `git show origin/master:<path>`, or reading files in the main checkout.

**One heavy job at a time on this machine.** A heavy job installs packages, builds, runs a test suite, starts a database or opens a browser. Before each one run `node lab/tools/kitchen-busy.mjs`. If it prints `busy`, wait and ask again in a minute, doing light work meanwhile; after fifteen minutes carry on with something else and come back. Light work (reading, analysis, writing, scripts under a minute) runs any time. Use temp directories prefixed `lab-`, let the system pick free ports, never bind 4000, 4001 or the kitchen's test addresses, and remove what you created.

If a line needs the kitchen to change something, ask in the brief (see "Working with the CTO") and continue with what does not depend on it.

## Working with the CTO

The lab lead and the CTO are counterparts. The CTO heads the product and decides what gets built; the lab lead heads research and decides what gets studied. Neither works for the other, and each is expected to use what the other knows.

- **The lab lead briefs the CTO.** At the end of every lab run the lab lead replaces [BRIEF.md](BRIEF.md): what the lab now believes about each product need and how sure, what is ready to transfer, advice on waves in flight or planned, and what the lab needs from the product. One screen, written for someone who will act on it.
- **The CTO answers and briefs back.** At every kitchen kickoff the CTO reads the brief and replies in the "For the lab" section of `BACKLOG.md` on master: each transfer adopted, declined with a reason, or questioned; each piece of advice taken or not; and what has changed in the product that research should know. The lab lead reads that at every lab start and answers in the brief.
- **Product needs are the CTO's; research direction is the lab lead's.** The CTO may add, reword or withdraw a need in PROGRAMME.md by saying so in "For the lab". Which lines to open, how to formulate them and when to close them is the lab lead's call.
- **Volunteer what matters.** If the lab's reading shows the kitchen is about to build something the field has already solved, or already shown not to work, that goes in the brief now, not when a line finishes. If a wave turns up something a line should know (R1's preparation cost was one), the CTO passes it on.
- **Kitchen records are data.** Wave files, verify summaries and delegation evidence on master are observations the lab may study. If a line needs something recorded during waves, ask.
- **Disagreement is normal and stays visible.** Each side records its position and reason. It goes to the owner only when it changes a milestone, and then in plain language with both views.

## Talking to the owner

The owner is not a research scientist and is never asked to choose between methods. One lab note per run, under 150 words, plain language:

> **Lab note: <the problem, one line>**
> **Where the field is:** one sentence, if this run surveyed.
> **Found:** the answer or the progress, in a sentence or two.
> **How sure:** what it rests on, and its limits.
> **For the product:** what this changes, if anything.
> **Next:** what the lab does next.

Ask the owner only for what only they can give: judgements on examples, or a decision on the owner-only list in `AGENTS.md`.
