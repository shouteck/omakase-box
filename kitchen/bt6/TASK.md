Explain how to bootstrap a cold copy of this repository

This repository is a Node.js + pnpm monorepo. A fresh copy of it — a git
clone, or the snapshot this tool ships inside a bounty — contains no
`node_modules` and no built output. The build cannot start until three
steps run in order:

    npm ci --prefix scripts/tooling --ignore-scripts
    node scripts/pnpm.mjs install --frozen-lockfile
    node scripts/workspace.mjs build

The first step restores the repository-local pnpm in `scripts/tooling`,
which `scripts/pnpm.mjs` needs before it can even start — the step a warm
checkout hides. `docs/box-v4/BOUNTY.md` never says this anywhere: a solver
working from a bounty snapshot discovers it only by failing first.

The job: add the cold-copy bootstrap to `docs/box-v4/BOUNTY.md`, where a
reader setting up a fresh copy would look — the three commands in order,
why the first one exists, and that they apply to any fresh copy, not only
a bounty. Match the page's existing style. Change nothing else.
