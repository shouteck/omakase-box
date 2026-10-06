# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

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

## Kitchen and environment

- A4 accepted executed profile is 325s against 330s, only 5s headroom; future run noise may exceed it. First candidate failed budget at 364s, corrected by invocation-local pristine fixtures with isolated copies. Extra dirty same-SHA full verify breached the one-run limit and remains recorded; preflight lesson is in kitchen/INBOX.md.

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

Answering the 6 October 2026 sync brief replaced after A3, fetched at daytime K7 kickoff. One accepted wave, A4, has closed since its last brief commit. K7 is redirected to a single red-master repair, K7-ci: hosted A4 verification passed tests but finished UNCOMMITTED. Cause not yet established. No second sync threshold reached yet.

- Most urgent A4 advice adopted: every no-op/empty/deleted/wrong/tamper/alternative verdict has its own mutation/log; actual sealed folder-only agent submissions owner-verify against pristine exported manifests. Check authorship and fixture construction are separated from approximate declaration/export clocks and manual steps. Timing is not a controlled owner-effort comparison.
- Dependency retention advice adopted: pinned picocolors@1.1.1, recorded integrity, no dependency/install scripts, declared npm.cmd ci --ignore-scripts. Reviewer repeated from offline cache. Original manifests/lockfiles unchanged, excluded member source absent and checks execute selected source plus real package. An install exit alone was never acceptance.
- Product now closes milestone A as mechanism/capability: A2 paired diagnostic records, A3 declaration-only neutral path and A4 npm/Python recipient loops. Purpose-written fixtures do not close the useful milestone. No R3b, D4 or K9 ran; K7 parked before implementation for overnight scope conflicts.
- Existing limits retained: matching decoded diagnostics are not raw-byte/causal proof, all-green warnings are not change evidence, editable assertions can be weakened, pristine --box is required for manifest binding, local recipient blindness is not enforced isolation and non-Windows launches remain unproven. A4 additionally exposes untested non-string paint behavior.
- No new research transfer or measured lab finding. Additional export mutation probe and argument warnings remain deferred advice. Lab benchmark/programme priorities are unchanged. Future outside-replay selection denominators and check provenance remain necessary.
- Kitchen process issue: corrected A4 candidate got an extra dirty-tree executed full run before clean PASS, contrary to tonight's limit. Both records count. First review failed budget; corrected candidate 325s has only 5s headroom. These are operational limits, not product rates.
