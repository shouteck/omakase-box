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

- Worker: box-cook (fresh agent) · Reviewer: box-pass (independent reviewer, this host — Devin/Windows)
- Commit: `be7a1885ff5afce7248bf2f5587766203caa7473` — `tests/box/bounty/bt7b-review.test.ts` only, +21/−15
- Verify: `verify be7a188 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=none 490s` — `.kitchen/runs/2026-10-13T02-55-25-803Z-be7a188/summary.json`, sha exact, `dirty:false`. Recorded PASS on this commit with a clean tree; relied on, not rerun (a repeat on the same SHA proves nothing new).
- Verdict: PASS · Level: test-verified
- What the stub looks like on each platform: Windows — `git.exe` is a hardlink/copy of `node.exe` plus a `NODE_OPTIONS --require` preload that prints `git version 2.39.9` when `process.execPath` ends in `git.exe` (mechanism unchanged, only moved inside the `win32` branch). POSIX — `bin/git` is a `#!/bin/sh` script `echo 'git version 2.39.9'` with `chmodSync 0o755`; no preload is planted. Assertions identical: exit 3, `refused (git-too-old)`, names `2.40` and `2.39`.
- Reproduce proof (independent): `resolveProgram` (`packages/box-package/commands.ts:73`) expands PATHEXT candidates only under `process.platform === 'win32'`, so `dir/git.exe` is never a candidate for `git` on POSIX — and `gitProgram` (`packages/box-bounty/git.ts:19-28`) resolves then probes `git version` once, refusing before any operational spawn. Reproduced live in WSL: an executable `git.exe` first on PATH leaves `command -v git` empty (`git` never resolves to it), while the test's exact POSIX stub resolves and prints `git version 2.39.9`. The always-answers stub is faithful: it is the same semantics the Windows preload gives `git.exe`, and the gate refuses before any git call that must not see it; a non-executable stub would read `git-missing`, not `git-too-old`, so the assertion still discriminates.
- Other `*.exe` stubs found: none needing the fix. Every `tests/` hit is `process.execPath` references, already-split fixtures (`bt7b.test.ts` carries the same split with `1.9.0`, `github-fixture.ts` `withoutGh`/gh stand-in, `github.test.ts` `win32 ? 'gh.exe' : 'gh'`, `bt7-ux-fixture.mjs` `gh`/`box` sh scripts), win32-skipped blocks (`bt7-git-channels.test.ts`, `command-checks.test.ts` `describe.skipIf`), or classifier strings in `k14-start-budget.test.ts`. Cook's audit claim confirmed.
- Review lenses: security / UX / measurement fairness — all correctly N/A, test-only change; nothing else answered.
- Findings: none. Limits: POSIX leg proven by code read plus WSL reproduction of the lookup mechanism on this host, not by a Linux CI run on this SHA.
- Merged: `10ca11e` (--no-ff, pushed) · Resources removed: `btbci2-pass-*` scratch dirs under WSL `/tmp` removed after the check; `wave/BT7b-ci2` branch deleted; cook's `bt7bci2-*` scratch swept
- Reflect: the failing test was the only `git`-named capability stub built the Windows way; the standing rule is now "a stub named `git` must be the file `git` resolves to on the running platform" — the `gh` stand-in already encoded it.
