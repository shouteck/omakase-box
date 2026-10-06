# K7-ci2: identify and fix final CI Git-state failure

Milestone: K · Station: evidence, packaging · Base: `85c69b5` · Branch: `wave/K7-ci2` · Timebox: 60 minutes active cook work, report partial at expiry

## Outcome

Owner's Go approves one follow-up correction after K7-ci. Hosted run37519849444 started clean, passed every named suite, then verifier returned UNCOMMITTED/exit3 at its final status check. Identify the exact state/read failure and fix its source, preserving clean-tree acceptance. Main K7 benchmarks remain out of scope.

## Scope

- Write: scripts/verify.mjs for bounded Git-state diagnostics and needed source correction; tests/** only the reproduced output/fixture lifecycle and focused kitchen regressions. Other scripts/** only if investigation proves a responsible generated-output write. No unrelated test refactor.
- Read: existing verifier/CI workflow, tests and active kitchen/lab records. Never .runtime/, .env*, secrets/, .execution/ or docs/legacy/. Filename-only Git status is permissible, no contents from prohibited paths.
- Do not touch: product core, dependency versions, security controls, Git settings, CI suite list, ignore filters to hide dirt, comments or existing test expectations. No repository deletion or new runtime/host. No second wave, downloads, paid services or new remote destinations. Disposable wave-owned fixture cleanup only.

## Done when

- Reproduce with actual programs in a clean disposable/controlled checkout. Distinguish final Git command failure from tracked modification/untracked generation, record exact path and first responsible step. Do not infer a Windows/npm defect from the Linux failure. Run the hosted suite profile locally as relevant, inspect status between focused suite invocations, but do not repeatedly execute full candidate verification while guessing.
- Add reliable bounded diagnostics for dirty/unreadable final status to console and summary: escaped path/status metadata or a named read failure, never file contents or environment/credential dumps. Dirty/unreadable must remain nonzero and non-reusable. If the source cannot be reproduced on this host, report that limitation rather than call a diagnostic-only change a complete repair.
- Red-first regression catches the actual dirty write/read failure; fix responsible fixture/output lifecycle without loosening checks, resetting Git or ignoring files. Independently show source bytes/base history intact and fixture outputs removed at scope end. Include a deliberately dirty/unreadable final-status negative and clean-run positive. Preserve K7-ci early preflight and importer parity.
- One executed clean final candidate acceptance uses the hosted obligations: `node scripts/verify.mjs --full test:bootstrap test:auth test:contracts test:planner test:box-contracts test:box-auth test:box-delegation test:analysis test:compiler test:runner test:portal test:acceptance test:e2e test:kitchen`. Deduped named check suites stay named. Check HEAD/status immediately before; no full run with Result notes dirty. All affected targeted regressions first. Reviewer relies on recorded same-SHA PASS unless stating a doubt, performs own focused attacks, never claims Linux green from Windows.
- Hosted status is queried without waiting after merge. Review/local pass plus actual source reproduction gates integration; diagnostic-only result must be explicitly partial, not a guessed fix.

## Review lenses

- [x] Security: no acceptance weakening, no tracked reset/ignore bypass, hostile filename diagnostics escaped and no secret contents.
- [x] User experience: failure names exact state/read cause and responsible stage when available, not just '+dirty'.
- [x] Measurement fairness: every invocation and unknown preserved; executed/reused distinct; no inferred Linux pass or performance saving.

## Notes for worker

Bug-fix playbook. Fix Root Causes requires exact failure data before an alleged fix; Prove It Works requires a reproduced source and independent attacks. Current final verifier only computes `statusAfter === null || statusAfter.trim().length > 0` and discards status details. Existing failed log is at C:/Users/shout/AppData/Local/Temp/devin.exe-overflows/shell-25f66f-5e7444a50935108a/content.txt, or gh run37519849444 log-failed. Do not start other agents, merge or push. No comment additions/removals, including new code. Commit final code before acceptance; write Result uncommitted only after run for CTO master transfer. Use per-command safe.directory for every Git call and named kitchen-k7-ci2 resources; clean only owned/standing-approved resources while idle. Return coherent findings before timebox if source is platform-specific or extra scope needed.

---

## Result

Pending. CTO Devin Desktop / Windows, GPT-6.1 Sol Medium Thinking; role identities unknown until dispatched.
