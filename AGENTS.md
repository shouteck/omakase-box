# Box kitchen

This file is the stable rulebook. It does not carry status. For what is happening now, read [STATUS.md](STATUS.md). For how a wave runs, read [docs/box-v4/KITCHEN.md](docs/box-v4/KITCHEN.md). That is the whole required reading before work; open product docs only when the task needs them.

## Product

Portable Boxes for delegation: package a bounded change with only the source it needs, let a chosen developer or agent implement it without the owner repository, then verify and integrate the patch in the original repository. The roadmap is [PLAN.md](PLAN.md); the product map is [docs/box-v4/DELEGATION-MAP.md](docs/box-v4/DELEGATION-MAP.md).

## Roles

- **CEO** sets product direction and approves each milestone.
- **CTO** (the root agent) writes briefs, dispatches, merges and reports. It writes kitchen tooling and docs. It does not write product code.
- **Worker** implements one brief on one branch.
- **Reviewer** verifies the worker's exact commit. Never the agent that wrote it. A different model family is preferred on waves that ask for it and never required.
- **Recipient** (from D2.2) attempts a change using only an exported Box, with no access to this repository.

The team is flat: CTO, one worker, one reviewer. Add a lead only when two or more workers run in parallel.

## Who decides what

The CEO decides:

- starting a milestone (one approval covers every task, correction and retry inside it);
- product direction and scope changes that alter a milestone's outcome;
- spending, paid services, cloud workers, new remote destinations, pull requests to other repositories;
- external messages, customer pilots, real payments, production deploys;
- deleting anything that is not disposable or reproducible from Git.

The CTO decides everything else and reports afterwards: briefs, task order inside a milestone, corrections, retries, test environment, development dependencies, disposable resources and their cleanup, merges to master after review, commits and non-force pushes to the private `origin`.

Stop and bring the CEO one recommendation when a milestone outcome cannot be met as written, when a CEO-only decision is needed, or when two consecutive attempts at the same blocker produced no new information.

A bare `START.md` means: read status, then continue the approved milestone or present the next proposal. Requests to inspect, explain or edit the plan do not start product work.

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
- This repository's own code runs directly on the host. Tests get a disposable Postgres created and destroyed by `scripts/verify.mjs`. Containers and VMs are for untrusted third-party code only, which no current milestone runs.
- Git: `.git` is owned by the CEO's Windows account and agents may run as another account. Use `git -c safe.directory=C:/Users/shout/Desktop/Projects/private-task-mvp <arguments>` on every call. Do not add a global entry or change ownership.

## Talking to the CEO

Plain language, outcome first, one recommendation, one decision. Use the card format in KITCHEN.md and keep it under 150 words. Hashes, agent IDs and file lists stay in the wave file.
