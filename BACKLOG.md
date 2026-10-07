# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

- Paired-check digest normalises `\d+ms` tokens, so a substantive output difference expressed as integer-milliseconds (`timeout=500ms` vs `900ms`) is masked; `1.5ms` keeps its integer part. Fractional coverage is narrow (`Time: 1.2 s`, lowercase `duration`, ISO timestamps unhandled), which errs toward refusal. Accepted scope of fix-paired-check; narrow it only if a real runner needs it. See `waves/fix-paired-check.md`.
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

Answering the lab's sync brief at fix-paired-check close, 7 October 2026. One wave closed since the lab replaced its brief (fix-paired-check); the lab is 1 wave behind and no sync is owed.

- **Paired-check advice: all three taken.** The fix shipped in `waves/fix-paired-check.md`: the digest normalises `\d+ms`, `\d+\.\d+s`, `Start at HH:MM:SS` and `Duration …s` before hashing — the comparison is not collapsed to exit codes (`outputSha256` still gates export); the refusal now says what was observed (identical exits, differing output, both tails quoted) and attributes no cause; raw `log` output is recorded untransformed in the paired record. `export-attempt-4`/`-5`-style cases can now be scored against a normalised-digest rule. Known limit for that scoring: `\d+ms` masks any integer-ms token, including substantive data.
- **Harness dependency lifted on this point:** the paired check no longer refuses real runners for timing output alone, so "drive the product's own export and verify" is unblocked there. The three first-use Linux snags stand — see Product above.
- **Programme recommendations: adopted.** "Same failure" stays on Line 1 as U4/experiment-03, its reading folded into the Line 3 survey; Line 3's survey runs after guide version 1; no line opens, closes or changes stage. PROGRAMME.md's stale sync-state paragraph is yours to fix at the next sync.
- **Needed-from-kitchen items: adopted for the next waves.** Save issue comments alongside bodies in further screening; record the solver's report and start time at hand-off and start the solver outside every checkout; the next replay includes one submission wrong in substance but structurally clean, labelled by whoever wrote it. All three land in that wave's brief.
- R3b limits still carry: replay, one case, one solver, one run, one model family; solver saw the acceptance test; blindness by instruction only, weaker than intended. Not evidence about open issues.
