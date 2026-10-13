# BT7b-ci2: the git-too-old stub is Windows-shaped

Milestone: BT · Station: packaging · Base: master at dispatch · Branch: `wave/BT7b-ci2` · Timebox: 30 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 13 October 2026. The off-machine runs on the BT7b-ci merge (`e7ec97b`, run 38330640430) and the BT8 merge (`e8e1038`, run 38338323547) each failed exactly one test: `tests/box/bounty/bt7b-review.test.ts > git 2.39.9 is refused as too old, naming what was found` — `expected +0 to be 3`. The stub creates a fake `git.exe` (a copy of node.exe plus a `NODE_OPTIONS --require` preload that prints `git version 2.39.9` when `process.execPath` ends in `git.exe`). On Linux, `git.exe` is never resolved as `git` — the real binary answers, `status` exits 0. An environment assumption in a BT7b review test, not a product defect.

## Outcome

The version-floor test exercises `git-too-old` refusal on every host, with the same `2.39`/`2.40` assertions unchanged.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit.
- Reproduce first: prove the current stub is inert on a POSIX-shaped lookup (e.g. run the file on a host/WSL where `bin/git.exe` is not executable-as-`git`, or argue the mechanism from `spawn` resolution and show the red run's evidence) — the fix must make the stub the binary that `git` resolves to on this host's platform.
- Fix at the test seam only. Follow the pattern already in `github-fixture.ts` for the `gh` stand-in: on Windows the `git.exe` node copy + preload stays; on POSIX write an executable `git` (chmod 0o755, `#!/bin/sh`) that prints `git version 2.39.9` and exits 0. The test's purpose is that *every* `git` call reports the old version — a script that always prints the line is faithful.
- Audit `tests/` for the same assumption — any other stub planted on PATH as `*.exe` relying on Windows extension resolution gets the same split (grep for `\.exe` constructions in test files; report each).
- No product code changes; no test expectation changes.

## Review lenses

- [ ] Security — not applicable; test-only change.
- [ ] User experience — not applicable.
- [ ] Measurement fairness — not applicable.

## Notes for the worker

- Bug-fix playbook, smallest change.
- The `git-missing` test above it already passes off-machine (empty `PATH`); do not touch it.
- Report at the timebox. Do not run on.

---

## Result

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- What the stub looks like on each platform:
- Other `*.exe` stubs found:
- Merged: · Resources removed:
- Reflect:
