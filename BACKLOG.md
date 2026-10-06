# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

- R3 independently reproduced owner-base install refusal on packageManager nub; current product hardcodes pnpm and does not supply --ignore-scripts. Container execution must enforce script disabling before any retry; no package-manager-specific adapter masquerading as generic support.
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

## Kitchen and environment

- A verify run that is killed leaves its embedded database processes and data folder behind (six processes after the stopped R3 run). Have verify clear its own stale database when it starts.
- A1 removed the old declared-pnpm verb gate and fixed-tool dispatch. Declared arbitrary commands are now owner-approved execution authority, not a sandbox; remaining product-owned installs retain script disabling. Windows shims refuse unsafe tokens including trailing backslashes; non-Windows launches are unproven. Export checks solver prerequisites on its own host. See `waves/A1.md`.
- A1 preserves inherited code comments under the host no-comment-edit rule; some still describe the old pinned-tool design. Current behavior is documented in `docs/box-v4/delegation/SUBMISSION-CONTRACT.md`; updating those comments requires an explicit request.

- The packaging tests and the K6 budget recorder leave their temp folders and log files behind (`box-d21-*`, `box-k6-*` in the system temp folder). 1,590 had built up by midday on 6 October 2026 and were removed by hand once the kitchen was idle. Make the tests remove what they create; until then, clear them at wave close.

- Prior K6 temp buildup was cleared manually while idle, per owner commit `326ee7d`; that historical ownership blocker is resolved. The exit-cleanup leak remains; each new wave must inventory and remove its own resources, not bulk-delete unknown data.

- Property-based guard tests and Box packaging mutation checks: retained from the kickoff inbox; require a separately named kitchen wave.
- Mechanically bind review verdicts to completed reviewer invocation/commit evidence, distinguishing reused steps. A1's unfinished-run mistake is now addressed in the reviewer role; verification-tool enforcement needs a separately named kitchen wave.
- K6 added packaging operation counts and an explicit full-profile budget; invocation/PID time-window counting can miss reused PIDs or mix simultaneous matching logs. Give counters a run identity before relying on parallel measurements.
- Monthly upstream pstack comparison: last done 5 October 2026 against 0.15.10; not due at this kickoff.

- Verify reuse trusts `.kitchen/runs` records by consistency, not signature — a hand-forged fully-consistent run dir can fake a reused PASS. Accepted; `--fresh` is the antidote and the pass uses it when it doubts a record. From K5.
- The `check` path→suite table covers direct imports only; a transitive edge can slip scoped `check`. `--full` is the documented backstop. From K5.

- Ports 4000 and 4001 are held by Docker Desktop when it runs; host tests bind 127.0.0.2 with loopback mirrors (`scripts/host-test-runtime.mjs`).
- `tests/box/delegation/support.ts` caches its run directory per module, so one `delegationPool()` per test file. Fix when a test needs two.
- Three suites carry host-bound tests excluded from CI (`test:box-package` case-alias, `test:security` absolute-path probe, `test:containers` local-image): a per-file split or linux lane would restore them. From K8.
- `doctor.mjs` reports the `databases` check as unverified since the synthetic stack was removed. Honest label, not a failure.
- Cook and pass have been the same model family on every wave so far. Accepted; see "Review" in KITCHEN.md.

## For the lab

The head chef's answer to the research brief (`git show origin/lab:lab/BRIEF.md`), replaced at each kitchen kickoff. The lab lead reads it at every lab start.

Answering fetched 6 October 2026 session 4 at the K7/A3/A4 overnight kickoff. A2 is accepted and the lab is one accepted wave behind.

- A2 advice adopted: paired full normalized decoded-text digests now compare diagnostics beyond the bounded tails and frame both streams as JSON. Missing runtime files with the same red exit are refused when output differs. This is not causality or raw-byte equivalence.
- A3 now accepted: neutral declarations need no generated Node files or implicit install/compile. R1 right/no-op replay and R2 candidate evidence passed. The independent pass specifically rejected removed parameter with unchanged caller by the declared outcome check. Editable assertion weakening remains accepted and reported. Optional Node helper modules remain explicitly opt-in, not universal core prerequisites. A2 and A3 are two accepted waves since the lab brief; run a read/write-only lab sync at this close.
- A4 advice adopted: immutable guard files, no-op/empty/deleted/wrong candidates and an alternative right solution where feasible; record authorship and timing of fixture checks. Fixtures prove capability, not inexpensive real-issue preparation or the useful milestone.
- Additional editable-mutation export probe and argument-name warnings deferred: no new transfer is ready and these are not required for the approved A3 core migration. No lab result is treated as a new kitchen measurement.
- Night scope is K7, A3, A4 only. K7 is parked before implementation because its verify.mjs edits are forbidden overnight and five full-run measurements conflict with tonight's one-full-run limit. No R3b, D4 or K9.

- Direction updated: R3 closed without useful outside-repository delegation. A0 and A1 are accepted; A1's independent Windows packaging review and off-machine full verification passed. This run names A2 only, explicit selection and paired full-repository/Box base checks. A3/A4 and useful outside-repository delegation remain unproven. R3b follows A4; lab Line 1 and D4's benchmark need remain.
- Base-check transfer adopted and retained: R2 now runs declared checks on the base and owner-side, records exits/context/roles, rejects red guards and warns on all-green outcomes. The lab's description predates that product change. A1 preserves these checks; A2 will compare the same outcome check in the full repository and Box so missing files cannot masquerade as evidence of change.
- Format advice adopted: A1 now accepts arbitrary setup/check programs, empty setup and arbitrary executable prerequisites without a required fixed toolchain or unrelated generator. Historical evidence stays unchanged. A2 builds on that runner; optional legacy Node/generated fixtures are not neutral readiness evidence by themselves.
- Import-travel advice retained, not made a universal rule: imports help select TypeScript files but miss runtime paths. A2 makes selection explicit and import following optional; execution, not a clean install, proves the selected files.
- Guard independence and wrong/right attacks retained: R2 showed editable checks can accept weakened assertions. Prefer immutable independent guards, test no-op and wrong candidates, and report uncovered cases. Existing tests alone do not establish full preservation.
- R1 guard result and literature numbers noted, not rerun or extrapolated: a reproduced lab result is evidence from the lab, not this kickoff. Seven hand-picked travel tests and the student study are not product error rates.
- Per-run evidence still needed: direct exits and exact commits remain authoritative. A0 reproduced 18 offline prototype trials, 10 worked, on one Windows host with no outside dependencies or blind recipient. It found installers can exit 0 with missing workspace code, and Windows command shims require an explicit launch rule.
- No new transfer in the fetched brief. A2 adopts its runtime-path warning as a same-exit/different-failure negative and requires paired observations, not just nonzero exit equality. Matching diagnostics still do not prove causality or preservation. A4 supplies actual npm/Python delegation and outside-dependency evidence; no research finding is a blocking gate.
