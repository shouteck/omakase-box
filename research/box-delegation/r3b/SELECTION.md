# R3b-1 selection: project and screening procedure, fixed before any result

Written by the cook on wave/R3b-1. Session start read from `date -u` on the host: 2026-10-06T23:13:26Z.
This file is committed before any candidate is listed and before any test is run. Its commit time is the proof of order.

## Project chosen: `tj/commander.js`

https://github.com/tj/commander.js — the first project the brief names. Checked against the rule with read-only `gh api` GET requests only (repository metadata, root file listing, `package.json`, two merged-pull-request counts). No issue or pull request text was read to make this choice.

| Rule | Observed | Met |
|---|---|---|
| Well known, actively maintained, permissive licence | 28,416 stars; MIT; not archived; `pushed_at` 2026-10-05; 92 pull requests merged since 2025-10-01, 42 since 2026-06-01 (search counts) | yes |
| JavaScript/TypeScript on Node, committed lockfile, npm or pnpm | `package-lock.json` at the root; `engines.node >=22.12.0` (image has 24.11.0); only devDependencies | yes |
| Tests run one file at a time, no services, browsers or network | `"test": "node --test && ..."`: Node's built-in runner, which takes file paths; 112 entries in `tests/` | expected yes; confirmed or refuted by the first container run |
| Regular small bug fixes whose pull requests include a test | Not judged yet. Only the merge counts above were read. The candidate list decides this; if fewer than eight candidates exist, the count found is reported | unknown at selection |

Fallback order if commander.js fails the rule in practice (tests need network or a service, or the lockfile install fails): `yargs/yargs`, then a third project. A dropped project is reported with its reason.

## Candidate rule (fixed now)

Query, run once, raw output kept in `evidence/`:

    gh pr list --repo tj/commander.js --state merged --limit 100 --json number,title,mergedAt,labels,body,baseRefName,mergeCommit,closingIssuesReferences,files,url

Sorted by `mergedAt`, newest first. A pull request is a candidate when both hold:

1. Bug fix: it closes an issue (`closingIssuesReferences` is non-empty, or the body has `fix(es|ed)` / `close(s|d)` / `resolve(s|d)` followed by `#N`), or it carries a label containing `bug` or `fix`, or its title starts with `fix`.
2. It changes at least one source file (`index.js` or `lib/**`) and at least one test file (`tests/**` with `.test.` in the name).

The first eight in that order are screened. None is skipped. If the 100 most recent merges hold fewer than eight, the next 100 are fetched the same way.

## Per-candidate definitions (fixed now)

- **Fix commit**: the pull request's `mergeCommit`. **Base**: its first parent.
- **Fix's tests**: files under `tests/` that the fix commit adds or modifies relative to base.
- **Guards**: every `tests/**/*.test.*` file present at base that the fix commit does not touch. The tests folder is flat, so "beside the changed source" is taken as the whole untouched suite, which is the stricter reading.
- **Run A** (fix's tests at base): check out base, overlay only the fix's test files with `git checkout <fix> -- <files>`, run `node --test <files>`.
- **Run B** (fix's tests at fix): check out fix, run the same command.
- **Run C** (guards at base): check out base unchanged, run `node --test <guard files>`.
- **Qualifies** when A exits non-zero with an assertion about behaviour (not a load error, missing export or syntax error), B exits 0, and C exits 0. Each failure is read and judged in one line. Before calling a maintainer-test failure the wrong reason, a plausible alternative reading is checked (lab advice).
- A candidate with no linked issue is still screened and recorded; it is dropped as "no issue text" because wave 2 needs the issue as the request.
- Exit codes are the container process's own, written by the script that spawned the command, never read from printed text and never from a pipeline.

## Container recipe (fixed now)

- Image `kitchen-r3b-tools`: `node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152` plus `git` and `ca-certificates` from apt. Nothing else.
- Volume `kitchen-r3b-src` holds the clone; `kitchen-r3b-out` holds logs. No mount of this repository or the user's home, no Docker socket, no `--privileged`, no host environment passed in, `--memory 2g`, `--user node`.
- Network on for: the image build, `git clone`/`fetch`, and `npm ci --ignore-scripts` from the committed `package-lock.json`. Every test run uses `--network none`.
- Dependencies are installed at each commit tested whenever `package-lock.json` differs from the last installed one; otherwise `node_modules` is reused, and the log says which.
- Nothing is sent to the project: read-only `gh` queries and an anonymous HTTPS clone only.
