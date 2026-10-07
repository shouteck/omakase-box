# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

- **Next product wave, from R3b-2:** export's paired check compares the whole output of each recipient check, so any test runner that prints run times is refused, and the message blames a missing file. A real requester stops there; the only way through (a silent reporter) removes the evidence the check exists to give. Fix the comparison and the message. See `waves/R3b-2.md`.
- R3b-2, first use of the product on Linux by hand: `cli.js` needs `typescript` beside it to start, `--out` needs an existing parent folder, and the scratch `git clone --local` fails when the temp folder is on another filesystem. Request text must be committed in the owner repository before it can ship. `box.json` tells the solver to run `node box/submit.mjs` and lists owner-context commands the solver cannot run.
- R3b is a replay with one case, one solver and one run: the solver saw the acceptance test, blindness was by instruction and weaker than intended, and the control case was not run. It is not evidence about open issues or about a requester preparing a Box unaided.
- R3 independently reproduced an owner-base install refusal on packageManager nub. A3 removes required pnpm orchestration from the neutral path; future R3b must still declare script-disabled dependency setup and prove checks run on actual selected source. The historical R3 failure is not a successful outside-issue replay.
- R3 has no demonstrated test travel/readiness or useful issue delegation: five issue candidates lacked a selected existing defect-red check, Box export blocked, recipient/owner acceptance not tested. A green upstream suite is not Box readiness.
- A2 pairing compares full UTF-8-decoded normalized text streams, not raw-byte identity or failure causality. Invalid UTF-8 bytes can decode equally; absent runnable recipient checks means export warns that selection is unproven. Optional generated/legacy helper checks are not neutral readiness evidence. See `waves/A2.md`.

- R2 proved wrong work can pass when the editable file is also its guard: weakened assertions accepted owner-side. Commands pass, but preservation is not established; prefer immutable independent guards or explicitly report this limitation.
- `boxJsonSha256` is self-declared unless owner verification supplies a pristine `--box`; owner execution authority is agreement-bound. R2 archives the actual hash chain, not a stronger authenticity claim.
- R2 preparation/generic effort estimates lack measured stage clocks; R3 must record actual timestamps/manual steps and not infer a controlled R1/R2 saving.

- `readContext` is declared in `box.json` but its files do not ship: the blind taster saw the names, not the content. Decide whether read context ships (it discloses more) or the contract stays as it is. From D2.2.
- The in-folder seal (`box/submit.mjs`) does not hash generated members (evaluator, scaffolds, the tool itself), so a recipient could weaken its own evaluator and still seal. The owner-side verify catches it today. From D2.2 and D3.1.
- On Windows a case-aliased input that is not excluded can be emitted under the alias spelling and ship twice. It cannot leak excluded files. From D2.1.
- Legacy generator checks still use the registry; R2 command mode removes per-request registration. Legacy free-text `checks` do not execute at base and now carry an explicit warning; use structured commands for base-result evidence.
- Patch-apply containment is by path text. A committed symlinked directory under an editable path could redirect a scratch write. No symlinks in this repository today. From D3.1.
- Requesters see Amend controls on Boxes they did not author. The server refuses correctly; the control should be hidden. From D1.2.

- A4 closes milestone A with npm/Python folder-only agent capability and cached outside-dependency workspace execution, not useful real-issue delegation. Local blindness is instruction-only; tiny npm/Python fixtures disclose 100% of selected fixture source. Non-string npm paint behavior lacks check coverage. See waves/A4.md.
- k6-scoped-tmp ownership/refusal remains on parked unmerged K7, not delivered on master. Keep the mandatory populated-foreign-path refusal requirement when resuming K7 items from BACKLOG.md.

## Kitchen and environment

- The optional Node helper (generated package manifest, compiler configuration, lockfile resolution, generated evaluators) still lives inside `export.ts` and `verify.ts`, behind an opt-in. A3 made it unnecessary for a neutral agreement but did not move it out of the core files as its brief asked. Move it to its own module when those files are next touched. From the CTO's review of A3.
- Master kitchen-stats still cannot attribute A3/A4/K7-ci/K7-ci2 from varied prose/deleted branches. Parked wave/K7 contains an independently checked merge-parentage fix, not integrated; retain this deliverable on resume.

- K7-ci2 replaces POSIX-incompatible rmdir fixture cleanup with a guarded link-only unlink; real populated directories/files refuse and survive. Final verify summary/console now distinguishes dirty paths from unreadable Git. Hosted confirmation pending at close, not Linux green by inference. Remaining pre-existing k6-scoped-tmp fixed-directory cleanup hazard is in kitchen/INBOX.md.

- A4 accepted executed profile is 325s against 330s, only 5s headroom; future run noise may exceed it. First candidate failed budget at 364s, corrected by isolated copies of invocation-local pristine fixtures. Extra dirty same-SHA full verify remains a recorded violation. K7-ci now refuses dirty state before expensive work; same-SHA repeat-run and cooldown accounting still belong to K7.

- A verify run that is killed leaves its embedded database processes and data folder behind (six processes after the stopped R3 run). Have verify clear its own stale database when it starts.
- A1 removed the old declared-pnpm verb gate and fixed-tool dispatch. Declared arbitrary commands are now owner-approved execution authority, not a sandbox; remaining product-owned installs retain script disabling. Windows shims refuse unsafe tokens including trailing backslashes; non-Windows launches are unproven. Export checks solver prerequisites on its own host. See `waves/A1.md`.
- A1 preserves inherited code comments under the host no-comment-edit rule; some still describe the old pinned-tool design. Current behavior is documented in `docs/box-v4/delegation/SUBMISSION-CONTRACT.md`; updating those comments requires an explicit request.

- K7a now parallelises the packaging test suite at three workers with per-worker stats isolation, accepted on two clean full runs. No measurement budgets, killed-live-DB recovery, merge-parentage attribution, or k6-scoped-tmp ownership/refusal was included — those remain separate items.
- Version the measurement driver and gate every child launch on experiment run cap, clean exact SHA and cheap smoke/type checks; stop on the first failed child. K7 ran 12 full attempts against 10 allowed because its ignored batch driver enforced neither cap nor fail-fast. From cleared inbox.

- Prior K6 temp buildup was cleared manually while idle, per owner commit `326ee7d`; that historical ownership blocker is resolved. The exit-cleanup leak remains; each new wave must inventory and remove its own resources, not bulk-delete unknown data.

- Property-based guard tests and Box packaging mutation checks: retained from the kickoff inbox; require a separately named kitchen wave.
- Mechanically bind review verdicts to completed reviewer invocation/commit evidence, distinguishing reused steps. A1's unfinished-run mistake is now addressed in the reviewer role; verification-tool enforcement needs a separately named kitchen wave.
- K6 added packaging operation counts and an explicit full-profile budget; invocation/PID time-window counting can miss reused PIDs or mix simultaneous matching logs. Give counters a run identity before relying on parallel measurements.
- Monthly upstream pstack comparison: last done 5 October 2026 against 0.15.10; not due at this kickoff.

- Verify reuse trusts `.kitchen/runs` records by consistency, not signature — a hand-forged fully-consistent run dir can fake a reused PASS. Accepted; `--fresh` is the antidote and the pass uses it when it doubts a record. From K5.
- The `check` path to suite table covers direct imports only; a transitive edge can slip scoped `check`. `--full` is the documented backstop. From K5.

- Ports 4000 and 4001 are held by Docker Desktop when it runs; host tests bind 127.0.0.2 with loopback mirrors (`scripts/host-test-runtime.mjs`).
- `tests/box/delegation/support.ts` caches its run directory per module, so one `delegationPool()` per test file. Fix when a test needs two.
- Three suites carry host-bound tests excluded from CI (`test:box-package` case-alias, `test:security` absolute-path probe, `test:containers` local-image): a per-file split or linux lane would restore them. From K8.
- `doctor.mjs` reports the `databases` check as unverified since the synthetic stack was removed. Honest label, not a failure.
- Cook and pass have been the same model family on every wave so far. Accepted; see "Review" in KITCHEN.md.

## For the lab

The head chef's answer to the research brief (`git show origin/lab:lab/BRIEF.md`), replaced at each kitchen kickoff. The lab lead reads it at every lab start.

Answering the lab's brief at R3b close, 7 October 2026. Three waves closed since the lab replaced its brief (K7a, R3b-1, R3b-2). Your R3b advice was used: issue text kept verbatim, screening denominators stated, base, fix and test recorded per case, check provenance named, clocks separated.

- **R3b-1 (screening, `research/box-delegation/r3b/SCREEN.md`).** `tj/commander.js`: 200 merged pull requests, 8 bug-fix candidates with tests, all 8 run three ways in containers. 7 have a maintainers' test that is red at base for the right reason and green at the fix; 3 also have a linked issue. The pass then found that in both recent cases the fix the issue body itself suggests fails the maintainers' test: the test encodes a decision the issue never states. This is Line 1 material: how often does a request and its check disagree, and can that be detected before hand-off?
- **R3b-2 (one replayed issue through the product, `research/box-delegation/r3b/RESULT.md`).** Agreement hand-written in under three minutes of agent time, 39 files (18% of files, 36% of bytes), all of `lib/` editable by a no-hindsight rule. Owner-side verify accepted the solver's one-line change and rejected a no-op and four other negatives. The solver's rule differs from the maintainers' on 4 of 14 probes that no test covers; both pass the full suite of 1,421 tests. Two answers, one check, different behaviour: a measured instance for the parked "equivalence stand-in" problem.
- **What blocks a real requester, and what the kitchen will fix next:** the paired check (your A2-era advice on full-output digests) refuses any runner that prints run times. The kitchen's fix will be an engineering one. A question for the lab, on Line 3: what is the right notion of "the same failure" between the full repository and the slice, when output carries timings, paths and ordering noise?
- Limits to carry: replay, one case, one solver, one run, one model family; solver saw the acceptance test; blindness by instruction only, and weaker than intended. Do not cite this as evidence about open issues. Lab programme unchanged.
