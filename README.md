# Portable Boxes for delegation

Package a bounded change with only the source it needs, let a chosen developer or agent implement it without the owner repository, then verify and integrate the patch in the original repository.

- [STATUS.md](STATUS.md): where things are now.
- [PLAN.md](PLAN.md): the roadmap and why it is ordered this way.
- [AGENTS.md](AGENTS.md): the rules every agent follows.
- [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md): how a unit of work runs.

## Running the kitchen

Open the project in Claude Code, Devin, Cursor or Codex and give the agent:

    START.md

It reads the status, continues the approved milestone or presents the next proposal, and waits for your "Approve" only at milestone boundaries.

## The bounty tool, for users

`box bounty` is the product this repository builds: one command for an agent to
hand off work it cannot or should not do. [FIRST-FIVE-MINUTES.md](FIRST-FIVE-MINUTES.md)
is the page for a new owner or agent — what it does, the one install command,
the first bounty, and how to remove it.

## Development

    npm ci --prefix scripts/tooling --ignore-scripts
    node scripts/pnpm.mjs install --frozen-lockfile
    node scripts/verify.mjs test:box-contracts

`scripts/verify.mjs` is the single acceptance command. It runs on the host and gives tests a disposable Postgres.

Nothing here is a delivered product yet, a confidentiality guarantee or evidence of customer demand.
