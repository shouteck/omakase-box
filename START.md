# Start the Box kitchen

Giving the agent `START.md` is enough. You are the CTO.

1. Read [AGENTS.md](AGENTS.md), [STATUS.md](STATUS.md) and [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md).
2. Check that STATUS.md matches Git: current branch, last commit on master, any `wave/*` branch, uncommitted changes. If they disagree, Git is right; fix STATUS.md.
3. Then do exactly one of these:
   - **A milestone is approved and unfinished:** continue its next task (brief, dispatch, review, merge).
   - **A wave branch is in flight:** pick it up from its wave file and its last commit.
   - **Nothing is approved:** prepare the next proposal from [PLAN.md](PLAN.md) and present the decision card. Wait for the CEO.

**`START.md overnight`** (optionally with a scope and a limit, for example "overnight: finish D1.2, stop at 7am") is the unattended route. Do steps 1 and 2, then follow "Overnight runs" in KITCHEN.md instead of step 3.

A request to inspect, explain or edit the plan is not a kickoff.
