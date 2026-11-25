# Box kitchen

This file is the stable rulebook. It does not carry status. For what is happening now, read [STATUS.md](STATUS.md). For how a wave runs, read [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md). That is the whole required reading before work; open product docs only when the task needs them.

## Product

The bounty tool for coding agents: one command for an agent to hand off work it cannot or should not do. The tool packages the repository safely with the task and the agent's note on what it tried; the bounty is posted as a GitHub issue; a record in the project lets any later agent pick it up; solutions come back and the agent chooses; the chosen one is merged onto current code and can be undone. The tool never runs anything a solver wrote and never judges a solution. The owner is involved once, through standing rules. The plan, and the only roadmap, is [PLAN.md](PLAN.md). Rules of the product that bind every wave. Three hard stops: never-ship files never enter a bounty or come back in a solution; a private repository is never posted outside; nothing happens outside the authority the owner granted. Beyond those the tool enforces nothing, except that no bounty is posted or listed without a reward (BT60): using it, choosing a solution and rewarding one are the agent's or owner's decisions. No command returns nothing or fails silently; the tool states facts and never a verdict; a stranger's text is never shown as the tool's own; one real use before many.

## Handing work off

<!-- box-bounty -->
omakase-box can hand a task you cannot or should not do to an outside solver
and bring solutions back as facts. Posting is free apart from any reward the owner set, and goes only to this
repository's own public GitHub, as an issue; the owner's standing permission
applies (`omakase-box config` shows it). `omakase-box describe` says when it
is worth it. Using it is your call. Install: npm i -g omakase-box
<!-- /box-bounty -->

## Method

Every kitchen, on every host, works the pstack way (Lauren Tan, "poteto"): go deep before going fast, write less code of higher quality, and prove work on the real thing. This is a rule, not a suggestion.

- **Area bot:** before writing code, load `.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md` (invoke it where the host has the plugin, otherwise read it) and follow the fitting playbook in `.devin/plugins/box-pstack/skills/poteto-mode/playbooks/` (feature, bug fix, refactoring, investigation, prototype).
- **Tests:** [docs/box-v4/TESTING.md](docs/box-v4/TESTING.md): the level a test belongs at, and how one is replaced or removed.
- **Everyone:** the principles are in `.devin/plugins/box-pstack/skills/principle-*/SKILL.md`. Read the ones the task calls for, and in your report name each principle that changed a decision and what it changed. Do not cite one you did not read.
- Where pstack text assumes Cursor tools, cloud workers or pull requests, keep the idea and use what the host has. Where it conflicts with who decides what below, this file wins.

## Roles

The same on every host; [kitchen/README.md](kitchen/README.md) has the full picture.

- **Owner (CEO)** sets product direction and approves each milestone.
- **D3vin** is the owner's main contact: with the owner, it refines and decides each wave; then it keeps order, splits work by area, delegates parts, chooses serial or parallel, integrates and reports. It writes no code.
- **Area bots** carry out the work in their areas and prove it themselves. There is no cook, reviewer or chef role (owner, 26 November 2026, D-2026-11-26-area-team). A long wave, by clock or by concept, starts with `/plan`.
- **Blind taster (recipient)**, from D2.2, attempts a change using only an exported Box, with no access to this repository. **Participants** in a fresh-agent check are fresh sessions in scratch folders.

Role instructions live in `kitchen/roles/` and station knowledge in `kitchen/stations/`. Every brief names a station, and the bot carrying the work reads that station's card.

## Who decides what

The CEO decides:

- starting a milestone (one approval covers every task, correction and retry inside it);
- product direction and scope changes that alter a milestone's outcome;
- spending, paid services, cloud workers, new remote destinations, pull requests to other repositories;
- external messages, customer pilots, real payments, production deploys;
- deleting anything that is not disposable or reproducible from Git.

D3vin and the owner decide everything else: briefs, task order, area splits, serial or parallel work, corrections, retries, test environment, development dependencies, disposable resources and cleanup, merges to master, commits and non-force pushes to `origin`. The area bot carries out its delegated part inside those decisions and proves it. `origin` is public since 11 October 2026 and stays public: everything pushed can be read by anyone, so nothing unpublishable goes into a commit.

D3vin brings the CEO one recommendation when a milestone outcome cannot be met, a CEO-only decision is needed, or two attempts at the same blocker add no new information. An area bot brings these to D3vin.

The START message sets how much the kitchen cooks. `START.md` runs one wave and stops; `START.md: <waves>` or `START.md xN` runs those and stops; `START.md overnight` runs the night queue under docs/box-v4/OVERNIGHT.md. Every run opens with a short pre-cook card; a new milestone, a removal or an overnight run waits for the owner's "go". Kitchen waves run only when named or from the night queue. Nothing owner-only happens overnight. Requests to inspect, explain or edit the plan do not start product work.

## Rules that do not bend

1. Product code, tests and tooling reach master only through a wave. Acceptance is a green `node scripts/verify.mjs` run on the commit SHA, plus the brief's Done when checks and ticked lenses answered from the real artifact in the wave file. Kitchen documents (this file, STATUS.md, KITCHEN.md, briefs, agent profiles) may be committed directly by the bot assigned that kitchen work.
2. Never edit a test's expected outcome to make a candidate pass. A missing, failed or unknown check is not a pass. A wave that must change an existing test lists it under `## Changed expectations` in its wave file, with the reason; verify refuses otherwise.
3. One writer per branch. Parallel work uses separate worktrees.
4. Report what actually happened. No invented test results, agent identities, model diversity, customer evidence or Git history.
5. Do not read `.runtime/`, `.env*` or `secrets/`. Do not print credentials into logs.
6. Do not kill processes or remove containers, databases or files the kitchen did not create. Everything a wave creates is named for that wave and removed when it closes.
7. Do not force-push, rewrite history or change global Git, Docker, WSL, editor or model settings.
8. The retired platform's files are no longer in the working tree. They are in Git history at the tag `history/before-K52` and the branch `origin/archive/box-platform-2026-10`; read them only when the task is about history.

## Environment

- Windows host, 16 GB. Run heavy builds, browsers and test suites one at a time.
- Node and pnpm are pinned in `.node-version` and `scripts/toolchain.json`; use `node scripts/pnpm.mjs <arguments>`.
- This repository's own code runs directly on the host. Verification runs the bounty and kitchen suites without a database. Containers and VMs are for untrusted third-party code only, which no current milestone runs.
- Git: `.git` is owned by the CEO's Windows account and agents may run as another account. Use `git -c safe.directory=<this checkout's forward-slash absolute path> <arguments>` on every call (main checkout: `C:/Users/shout/orca/omakase-box`; Orca worktree: its own path). Never add a global entry or change ownership.

## Talking to the CEO

D3vin speaks to the CEO: plain language, outcome first, one recommendation, one decision. Use the card format in KITCHEN.md and keep it under 150 words. An area bot reports to D3vin the same way. Hashes, agent IDs and file lists stay in the wave file.
