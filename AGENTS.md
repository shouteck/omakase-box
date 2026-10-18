# Box kitchen

This file is the stable rulebook. It does not carry status. For what is happening now, read [STATUS.md](STATUS.md). For how a wave runs, read [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md). That is the whole required reading before work; open product docs only when the task needs them.

## Product

The bounty tool for coding agents: one command for an agent to hand off work it cannot or should not do. The tool packages the repository safely with the task and the agent's note on what it tried; the bounty is posted as a GitHub issue; a record in the project lets any later agent pick it up; solutions come back and the agent chooses; the chosen one is merged onto current code and can be undone. The tool never runs anything a solver wrote and never judges a solution. The owner is involved once, through standing rules. The plan, and the only roadmap, is [PLAN.md](PLAN.md). Rules of the product that bind every wave. Three hard stops: never-ship files never enter a bounty or come back in a solution; a private repository is never posted outside; nothing happens outside the authority the owner granted. Beyond those the tool enforces nothing: using it, choosing a solution and rewarding one are the agent's or owner's decisions. No command returns nothing or fails silently; the tool states facts and never a verdict; a stranger's text is never shown as the tool's own; one real use before many.

## Handing work off

<!-- box-bounty -->
box bounty can hand a task to an outside solver and bring solutions back
as facts — `box bounty describe` says what it does, what it costs and when it
beats doing the work yourself. Using it is always your call; the owner's
permission applies.
<!-- /box-bounty -->

## Method

Every kitchen, on every host, works the pstack way (Lauren Tan, "poteto"): go deep before going fast, write less code of higher quality, and prove work on the real thing. This is a rule, not a suggestion.

- **CTO:** at kickoff, load the mode skill, `.devin/plugins/box-pstack/skills/poteto-mode/SKILL.md`. Hosts that have the plugin installed invoke it as a skill; other hosts read the file.
- **Worker:** before writing code, open the playbook that fits the wave in `.devin/plugins/box-pstack/skills/poteto-mode/playbooks/` (feature, bug fix, refactoring, investigation, prototype) and follow its steps.
- **Everyone:** the principles are in `.devin/plugins/box-pstack/skills/principle-*/SKILL.md`. Read the ones the task calls for, and in your report name each principle that changed a decision and what it changed. Do not cite one you did not read.
- Where pstack text assumes Cursor tools, cloud workers or pull requests, keep the idea and use what the host has. Where it conflicts with who decides what below, this file wins.

## Roles

The same brigade on every host; [kitchen/README.md](kitchen/README.md) has the full picture and how any host staffs a role.

- **Owner (CEO)** sets product direction and approves each milestone.
- **Head chef (CTO)**, the root agent, writes briefs, dispatches, merges and reports. It writes kitchen tooling and docs. It does not write product code.
- **Cook (worker)** implements one brief on one branch.
- **The pass (reviewer)** verifies the cook's exact commit. Never the agent that wrote it, and it reports to the head chef, never to a station. Usually the same model family as the cook; a fresh agent is what makes it independent.
- **Blind taster (recipient)**, from D2.2, attempts a change using only an exported Box, with no access to this repository.
- **Station chef (lead)** runs several cooks on one station. It exists only after the promotion rule in kitchen/README.md is met.

Role instructions live in `kitchen/roles/` and station knowledge in `kitchen/stations/`. They are plain files, so nothing depends on one host's features: a host with named agent profiles uses them, and any other host starts a fresh agent and hands it the role file, the wave file and the station card.

Today the kitchen has one stove: head chef, one cook, the pass. Every brief names a station, and the cook and the pass read that station's card. Three levels is the most the brigade ever has.

## Who decides what

The CEO decides:

- starting a milestone (one approval covers every task, correction and retry inside it);
- product direction and scope changes that alter a milestone's outcome;
- spending, paid services, cloud workers, new remote destinations, pull requests to other repositories;
- external messages, customer pilots, real payments, production deploys;
- deleting anything that is not disposable or reproducible from Git.

The CTO decides everything else and reports afterwards: briefs, task order inside a milestone, corrections, retries, test environment, development dependencies, disposable resources and their cleanup, merges to master after review, commits and non-force pushes to `origin`. `origin` is public since 11 October 2026 and stays public: everything pushed can be read by anyone, so nothing goes into a commit that should not be published.

Stop and bring the CEO one recommendation when a milestone outcome cannot be met as written, when a CEO-only decision is needed, or when two consecutive attempts at the same blocker produced no new information.

How much the kitchen cooks is set by the START message, not by what happens to be ready. `START.md` runs one wave and stops. `START.md: <waves>` or `START.md xN` runs those and stops. `START.md overnight` runs the night queue unattended, under docs/box-v4/OVERNIGHT.md. Every run opens with a short pre-cook card; a new milestone, a removal or an overnight run waits for the owner's "go". Kitchen waves run only when named or from the night queue. Nothing on the owner-only list above happens overnight, whatever the reason. Requests to inspect, explain or edit the plan do not start product work.

## Rules that do not bend

1. Product code, tests and tooling reach master only through a reviewed wave. Acceptance is the reviewer's PASS on a commit SHA plus a green `node scripts/verify.mjs` run on that SHA. Kitchen documents (this file, STATUS.md, KITCHEN.md, briefs, agent profiles) are the CTO's to commit directly.
2. Never edit a test's expected outcome to make a candidate pass. A missing, failed or unknown check is not a pass.
3. One writer per branch. Parallel work uses separate worktrees.
4. Report what actually happened. No invented test results, agent identities, model diversity, customer evidence or Git history.
5. Do not read `.runtime/`, `.env*` or `secrets/`. Do not print credentials into logs.
6. Do not kill processes or remove containers, databases or files the kitchen did not create. Everything a wave creates is named for that wave and removed when it closes.
7. Do not force-push, rewrite history or change global Git, Docker, WSL, editor or model settings.
8. `.execution/` and `docs/legacy/` are frozen history. Do not read them unless the task is about history, and do not write to them.

## Environment

- Windows host, 16 GB. Run heavy builds, browsers and test suites one at a time.
- Node and pnpm are pinned in `.node-version` and `scripts/toolchain.json`; use `node scripts/pnpm.mjs <arguments>`.
- This repository's own code runs directly on the host. Verification runs the bounty and kitchen suites without a database. Containers and VMs are for untrusted third-party code only, which no current milestone runs.
- Git: `.git` is owned by the CEO's Windows account and agents may run as another account. Use `git -c safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp <arguments>` on every call. Do not add a global entry or change ownership.

## Talking to the CEO

Plain language, outcome first, one recommendation, one decision. Use the card format in KITCHEN.md and keep it under 150 words. Hashes, agent IDs and file lists stay in the wave file.
