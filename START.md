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
2. Check that STATUS.md matches Git: current branch, last commit on master, any `wave/*` branch, uncommitted changes. If they disagree, Git is right; fix STATUS.md. Then empty `kitchen/INBOX.md` ("Getting better" in KITCHEN.md).
3. Check the off-machine run: `gh run list -R shouteck/omakase-box --limit 3`. A red run on master comes first: the one wave this run may cook is the fix, and STATUS.md says so while it is red.

A request to inspect, explain or edit the plan is not a kickoff.
