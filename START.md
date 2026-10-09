# Start the Box kitchen

You are the CTO. How much you cook is set by the message that started you, and you stop when that much is done.

| Message | You run | Then |
|---|---|---|
| `START.md` | One wave: the one in flight, else the next wave of an approved product milestone. If no product milestone is approved, no wave: present the decision card. | Report and stop |
| `START.md: K9, R1` or `START.md x3` | The named waves in order, or that many from the queue in STATUS.md. Naming a milestone approves it. | Report and stop |
| `START.md overnight` | The night queue, under [docs/box-v4/OVERNIGHT.md](docs/box-v4/OVERNIGHT.md). | Morning card and stop |

**Stopping** means: the wave is merged or parked, STATUS.md replaced, master pushed, the main checkout back on master, one short card to the owner, and nothing more. Do not start another wave because one is ready, because there is time left, or because it is within your authority. Kitchen waves (K...) run only when named or from the night queue.

Before the first wave:

1. Read [AGENTS.md](AGENTS.md), [STATUS.md](STATUS.md) and [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md).
2. Check that STATUS.md matches Git: current branch, last commit on master, any `wave/*` branch, uncommitted changes. If they disagree, Git is right; fix STATUS.md. Delete any `wave/*` branch that is fully merged (`git branch -d`; skip it without asking if your host wants a confirmation). Then empty `kitchen/INBOX.md` ("Getting better" in KITCHEN.md).
3. Read the latest off-machine result (do not wait for a run in progress): `gh run list -R shouteck/omakase-box --limit 3`. A red run on master comes first: the one wave this run may cook is the fix, and STATUS.md says so while it is red.
4. Show the owner the pre-cook card, then start or wait as the table says.

> **About to cook: <wave ids>**
> **You will get:** up to three outcomes.
> **Checked by:** one sentence.
> **Touches:** what it changes, and plainly if it removes or deletes anything.
> **Timebox:** minutes. **Stops after:** the last wave named.

| What is starting | After the card |
|---|---|
| The first wave of a milestone, including one named in this message | Wait for "go" |
| A wave that removes or deletes anything beyond its own scratch files | Wait for "go" |
| An overnight run (the card is the night plan) | Wait for "go" |
| The next wave of a milestone the owner has already been briefed on | Start; the owner can interrupt |

Under 100 words. The card is a summary of briefs already written, not a new document. "Go" covers what the card says and nothing else.

A request to inspect, explain or edit the plan is not a kickoff.
