# The bounty tool for coding agents

`box bounty` is the product this repository builds: one command for an agent to
hand off work it cannot or should not do. The tool packages the repository
safely with the task and the agent's note on what it tried; the bounty is
posted as a GitHub issue; a record in the project lets any later agent pick it
up; solutions come back and the agent chooses; the chosen one is merged onto
current code and can be undone.

The open bounty board (`packages/box-platform`) lists every open bounty on a
public repository, read from GitHub. Once the owner sets its address
(`box bounty config set board <address>`), the tool tells it to look after a
post, a merge, a close or a paid record, sending only the repository, issue
number, bounty id and event name; `status` shows what the board says is owed,
recorded paid and confirmed received, and the owner's pay message names the
solver's accepted payment methods. With no address the tool makes no call.

[FIRST-FIVE-MINUTES.md](FIRST-FIVE-MINUTES.md) is the page for a new owner or
agent — what it does, the one install command, the first bounty, and how to
remove it.

- [STATUS.md](STATUS.md): where things are now.
- [PLAN.md](PLAN.md): the roadmap and why it is ordered this way.
- [AGENTS.md](AGENTS.md): the rules every agent follows.
- [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md): how a unit of work runs.

The older Box platform (export/submit/verify/trace, the services and the portal)
was retired by wave K29 and is preserved in full on the
`archive/box-platform-2026-10` branch.

## Running the kitchen

Open the project in Claude Code, Devin, Cursor or Codex and give the agent:

    START.md

It reads the status, continues the approved milestone or presents the next proposal, and waits for your "Approve" only at milestone boundaries.

## Build it from source

This needs Node 24. The lines after the clone run inside the new `omakase-box` folder, and they give you the same `box` command as the install. Then run `box setup`.

```bash
git clone https://github.com/shouteck/omakase-box
npm ci --prefix scripts/tooling --ignore-scripts
node scripts/pnpm.mjs install --frozen-lockfile
node scripts/pnpm.mjs build
npm install -g ./packages/box-cli
box bounty
```

## Development

    npm ci --prefix scripts/tooling --ignore-scripts
    node scripts/pnpm.mjs install --frozen-lockfile
    node scripts/verify.mjs test:box-bounty test:kitchen

`scripts/verify.mjs` is the single acceptance command. It runs on the host; no database needed.

Nothing here is a delivered product yet, a confidentiality guarantee or evidence of customer demand.
