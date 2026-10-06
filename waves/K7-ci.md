# K7-ci: repair dirty-checkout master verification

Milestone: K · Station: evidence, packaging · Base: `d4e0e99` · Branch: `wave/K7-ci` · Timebox: 60 minutes active cook work, report partial at expiry

## Outcome

Repair the latest red master Actions before performance work. START.md step 3 makes this correction the one wave this START.md K7 request may cook, then stops. GitHub run 37473156066 on A4 merge691cfd2 passed every named test step but acceptance exited3, UNCOMMITTED, because the tree was already dirty before verify began. Do not weaken clean-tree acceptance or hide generated/tracked changes.

## Scope

- Write only as root-cause evidence requires: scripts/verify.mjs, tests/kitchen/**, pnpm-lock.yaml. New focused kitchen regression files permitted. Fix the source of setup dirtiness rather than change Git status filtering. If the actual fix requires another path, report it before writing.
- Read: .github/workflows/verify.yml, scripts/{pnpm,workspace,suite,process}.mjs, workspace manifest, .gitignore, A4 package metadata and active kitchen records. Never .runtime/, .env*, secrets/, .execution/ or docs/legacy/.
- Do not touch product core, A4 fixture/check/agreement bytes, security settings, dependency versions, CI suite scope, caches owned by someone else, global config, comments or test expectations. No repository deletion. No new dependency or paid service; use already pinned local tooling and disposable wave-owned resources.

## Done when

- Reproduce the setup-dirties-clean-checkout fault in a disposable clone using actual pinned tooling, record exact changed paths/bytes and the setup step responsible. CI does not show which file was dirty; do not guess npm.cmd/Python failures, whose tests did not run in the hosted suite.
- Regression fails first, fix at source, regression green: standard frozen setup leaves tracked bytes and Git status unchanged. No lockfile/security-policy bypass, post-setup reset or ignore rule to mask source changes. Any root lockfile normalization uses pinned package manager with versions unchanged.
- Adopt kickoff inbox's applicable mechanism: dirty tree refuses before database/build/tests start, exits nonzero with useful non-secret diagnostic and is recorded honestly, not as an acceptable/reusable PASS. No implicit permission to log file contents. Acceptance remains clean committed SHA only. Broader attempt/cooldown counters stay with main K7 and must not grow this repair.
- One executed `node scripts/verify.mjs --full test:kitchen` passes on clean final candidate. Use scoped kitchen regressions before it. Verify Git HEAD/status immediately before invocation, keep Result notes elsewhere until after acceptance. Independent pass validates same-SHA record and attacks both clean-setup and dirty preflight; no fresh full rerun without stated doubt. CI suite has no host packaging tests; local repair coverage is named, do not claim full Linux CI success from Windows.

## Review lenses

- [x] Security: no clean-tree weakening or hidden tracked changes, no policy/config bypass, unrelated resources left alone.
- [x] User experience: dirty preflight is fast and actionable without dumping sensitive contents.
- [x] Measurement fairness: initial CI failure and every local attempt retained; executed versus reused distinguished; no invented Linux reproduction or performance gain.

## Notes for worker

Bug-fix playbook. Fix Root Causes means prove which setup file changed before fixing. Encode Lessons in Structure means refuse dirty state before costly work instead of repeating prose. Root workspace matches examples/* but lockfile has no A4 importers; that is a hypothesis, not a diagnosis. CI setup sequence: tooling npm ci, frozen pnpm install, Chromium setup, build, then verify. Existing verifier captures dirty once, runs184seconds of green work, finally rejects. Read and preserve inherited comments; add no comments to new code. Do not start agents, merge or push. Commit code before acceptance; leave waves/K7-ci.md Result uncommitted after verification for CTO transfer on master. Archive a compact command/result trail in Result, not a new documentation tree.

---

## Result

Pending. CTO Devin Desktop / Windows, GPT-6.1 Sol Medium Thinking. Role exact models unknown until reported.
