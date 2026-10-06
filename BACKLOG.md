# Backlog

Known gaps and leftovers that are not blocking. STATUS.md lists only what blocks work now. The head chef adds a line here when a wave leaves something behind, and removes it when a wave fixes it or the owner drops it. One line each; link the wave file for detail.

## Product

- R3 independently reproduced owner-base install refusal on packageManager nub; current product hardcodes pnpm and does not supply --ignore-scripts. Container execution must enforce script disabling before any retry; no package-manager-specific adapter masquerading as generic support.
- R3 has no demonstrated test travel/readiness or useful issue delegation: five issue candidates lacked a selected existing defect-red check, Box export blocked, recipient/owner acceptance not tested. A green upstream suite is not Box readiness.

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
- Declared pnpm commands: the code that locates the verb can disagree with pnpm's own parser for unusual option spellings, so an install-like command can pass as a run command. Accepted by the owner on 6 October 2026; removed by A1. From R3.

- The packaging tests and the K6 budget recorder leave their temp folders and log files behind (`box-d21-*`, `box-k6-*` in the system temp folder). 1,590 had built up by midday on 6 October 2026 and were removed by hand once the kitchen was idle. Make the tests remove what they create; until then, clear them at wave close.

- Prior K6 temp buildup was cleared manually while idle, per owner commit `326ee7d`; that historical ownership blocker is resolved. The exit-cleanup leak remains; each new wave must inventory and remove its own resources, not bulk-delete unknown data.

- Property-based guard tests and Box packaging mutation checks: retained from the kickoff inbox; require a separately named kitchen wave.
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

Answering the fetched brief of 6 October 2026 (still session 3), at approved R3 blocker-correction kickoff:

- **Direction unchanged:** PLAN's useful milestone is R2 then R3; lab stays on Line 1, kitchen improvements remain paused unless blocking, D4 awaits a benchmark. Study cheap request-to-check evidence and unfamiliar-repository gaps, not a presumed success rate.
- **Product / correction approval:** prior R3 negative archive unchanged: no selected issue/Box/recipient/owner acceptance, predeclaration and worker exits unreliable. Owner approved a bounded prerequisite correction; brief adds universal script-disabled product installs and direct run/declaration recording. No manager-specific adapter or project retry in this round; waiting pre-cook Go. Lab base-check/immutable-guard advice retained; useful milestone unmet.
- **Base-check transfer — adopted:** export will run every declared command and record exit code, context, guard/outcome role and exact base. Red guard is a preparation defect; all-green base warns there is no evidence of change. Unknown/timeout is not red-by-prose or PASS.
- **Existing import-based guard advice — adopted for R3:** predeclare a contrasting test sample before issue selection, run existing tests unchanged in owner and Box contexts, and report runtime-path/workspace/tool gaps. Choose an issue only with an existing red outcome attributable to its behavior; no contrived old base or bespoke check.
- **Format gap — adopted:** a reusable command-check mode must not require or substitute another request's evaluator; legacy generator mode remains compatible. Owner verify must execute its approved command data, not recipient claims or an unrelated registry entry.
- **R1 guard re-read — updated:** session 3 reports a clean-folder reproduction plus independent attacks; taken as evidence from the lab, not a rerun by this kickoff. It supports a guard half only, not cheap evidence of change or complete preservation coverage.
- **Per-run records — adopted structurally:** the approved correction will test direct subprocess exits, UTC boundaries, durable pre-run declarations and invocation identity. This adopts the inbox lesson as rerunnable checks rather than more prose; historical invalid records are preserved/retracted, not retroactively repaired. R2/R3 estimates still do not prove preparation in minutes.
- **Distinct owner check — strengthened from R2 evidence:** prefer existing immutable guards outside editables; record what the recipient sees. Guard independence concerns authority, not secrecy. If no defensible outcome/guard exists, report not ready instead of another editable self-check.
- **Wrong/right candidates — adopted:** no-op, empty edit, wrong edit, guard regression and check tampering, plus another right solution when feasible; record uncovered cases. No request-specific evaluator is written to force the result.
- **MJS and wording — adopted:** tsc is not evidence for unchecked mjs; R2's first candidate is TS. Say passes the agreed checks, never verified correct.
- **Research numbers — noted, not extrapolated:** three of seven hand-picked guards failed to travel and literature reports human confirmation errors; neither supplies this product's error rate. No generated-check confirmation shortcut is presumed safe.
- **Programme/need:** wrong work accepted, right work rejected and requester cost remain the scoring. Product will return concrete base/no-op/preparation records; no lab output is a blocking gate.
