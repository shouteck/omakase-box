# fix-paired-check: make export's paired comparison work with real test runner output

Milestone: R3b follow-up · Station: packaging · Base: `78b8cd3` · Branch: `wave/fix-paired-check` · Timebox: 40 minutes

## Outcome

export's paired check (outcome/recipient checks in the base clone vs the staged Box) does not refuse a check whose only difference between runs is timing-variable output (test durations, timestamps, "Start at" and "Duration" lines). The refusal message says what was observed ("output differs") instead of attributing the cause ("a missing selected file cannot masquerade as the declared outcome"). Raw base and Box output is preserved in the paired record.

## Scope

- **Write:** `packages/box-package/commands.ts` — add timing normalization to the `digest` function that `outputSha256` compares: replace timing patterns (`\d+ms`, `\d+\.\d+s`, `Start at HH:MM:SS`, `Duration N.Ns`) with fixed placeholders before hashing.
- **Write:** `packages/box-package/export.ts` — change the `outputSha256` mismatch error message (line 238). Instead of "a missing selected file cannot masquerade as the declared outcome", say what was observed: the check exits identically but its output hash differs, and cite the differing lines from the tail of each log.
- **Do not touch:** the `log` or raw output fields — only the digest changes. The verification logic (verify vs export) is unchanged: product-code paths that feed their own `--box` record do not run the paired check.

## Done when

- `node scripts/verify.mjs --full` exits 0 on the final commit.
- Two clean full runs on the same commit constitute acceptance.
- The paired check accepts two runs of the same test that differ only in timing output (verified by unit-testing the normalization function).
- The error message for a substantive output difference says what was observed ("output differs: ...") not "a missing selected file cannot masquerade".
- `outputSha256` is still computed (the record keeps it) — only the comparison uses the normalized hash.

## Review lenses

- [ ] **Measurement fairness:** the normalization must not hide a substantive difference. Only timing-variable patterns are replaced; everything else passes through unchanged.
- [ ] **User experience:** the refusal message now tells the requester what actually happened.

## Result

**FAIL (test-verified)** — reviewed commit `3e1fb5b89ad4563c314aa460848c2f91b87cc54f` on `wave/fix-paired-check` (cook's `70c5e0b` plus a reviewer-added test; the product code under review is identical).

Verify lines:
- `verify 70c5e0b PASS check=0 build=0 db=embedded 112s` (worker's run; `check` covered bootstrap/auth/contracts/planner only — `test:box-package` never ran on `70c5e0b`)
- `verify 3e1fb5b FAIL check=0 build=0 test:box-package=1 db=embedded 337s` (reviewer's executed `node scripts/verify.mjs --full --fresh test:box-package`, run `.kitchen/runs/2026-10-07T00-47-20-207Z-3e1fb5b/`)

**Blocking defect:** the new `outputSha256`-mismatch message in `export.ts` says "its output hash differs" — it dropped the word *differently* that two existing tests assert: `a2-selection.test.ts:188` and `:209` (`toMatch(/differently/)`, the stream-partition and NUL-split refusal probes). `test:box-package` fails 2 tests on this commit; the earlier `70c5e0b` PASS never exercised this suite. The refusal still fires (ExportFailed is thrown — the digest comparison still gates export); only the wording broke the existing contract. Fix is one word in the message (e.g. "…exits identically but its output differs — the Box fails differently than the base. Output tails: …"), or a deliberate test update by the cook. The reviewer may not do either: editing product code is out of role, and rewriting `/differently/` to `/differ/` would weaken an existing test to make the candidate pass.

**Reviewer-added test:** `command-checks.test.ts` gains 'normalises timing-variable output before hashing, while real differences still hash differently' — runs `runDeclaredCheck` on `node -e` output with `Start at HH:MM:SS`, `Duration N.NNNs`, `Nms` on stdout and stderr; two records differing only in timing text hash equal, the raw `log` keeps the real timings, and a record differing in substantive output hashes differently (the negative that makes it a check). Passed in a scoped run and inside the suite (33/33 in the file).

**Lens — measurement fairness:** the four replacements are exactly the scoped patterns and nothing else is touched; the digest still frames `[stdout, stderr]` so stream partition is preserved and stderr is normalised symmetrically. The negative test proves substantive differences survive. Residual risks worth naming: `\b\d+ms\b` masks *any* integer-ms token, so real data like `timeout=500ms` vs `timeout=900ms` would collapse to `Nms` (a substantive difference could hide behind a number-with-ms token); `1.5ms` normalises to `1.Nms` (fraction masked, integer kept); coverage is narrow — `Time: 1.2 s`, lowercase `duration`, ISO timestamps are not normalised, so equivalent runs can still refuse (the safe direction). Not collapse-to-constant: the a2 same-exit/different-reason and stream-repartition probes still refuse.

**Lens — user experience:** the message now reports what was observed — identical exits on both sides, differing output hash, and quotes the tail of each log — with no causal attribution. Wording matches the done-when's intent, though not its example literally ("output hash differs" vs "output differs: …"), and see the blocking defect above for the dropped "differently".

**Lab-advice checks:** `outputSha256 !== outputSha256` still gates export (`export.ts:237`); `log` fields and `outputSha256` are still recorded verbatim in the paired record (`export.ts:284–285`), and `log` is cut from the un-timing-normalised text; nothing else consumes the raw hash (verify path does not compare `outputSha256`).

**Findings:** 1 blocking defect (above). **Limits:** reviewer test covers the digest path, not an end-to-end export pair; the masking risk of `\d+ms\b` on substantive data is noted, not exploited — narrowing it would be a scope decision for the head chef.

Host/model: Devin Desktop, SWE-2.

## Result — re-review of the corrected commit

**PASS (test-verified)** — reviewed commit `acc93220f2325ed729d7e0b53ca067d29b4f1bbf` on `wave/fix-paired-check`.

Verify lines:
- `verify acc9322 PASS check=reused@2026-10-07T01-11-40-388Z-acc9322 build=reused@2026-10-07T01-11-40-388Z-acc9322 test:box-package=reused@2026-10-07T01-11-40-388Z-acc9322 db=embedded 11s` — this reviewer's executed `node scripts/verify.mjs --full test:box-package` (run `.kitchen/runs/2026-10-07T01-21-21-479Z-acc9322/`); all three steps reused the recorded fresh PASS below on this exact commit, clean tree
- `verify acc9322 PASS check=0 build=0 test:box-package=0 db=embedded 299s` — executed `--full --fresh test:box-package` (run `2026-10-07T01-11-40-388Z-acc9322`)
- `verify acc9322 PASS check=0 build=0 test:box-package=0 db=embedded 318s` — executed run `2026-10-07T01-04-15-276Z-acc9322`

Acceptance: two clean, fully-executed full runs on the same commit (`acc9322`) exist — the brief's bar is met; my invocation is a third PASS record on top.

**Fix verified:** the earlier blocking defect is resolved. `export.ts:238` now reads "…exits identically (base exit N, box exit N) but its output differs — the same declared check behaved differently in the isolated Box than on the untouched base. Output tails: …" — restoring the `differently` contract asserted at `a2-selection.test.ts:188` and `:209`. `git diff fb034ab..acc9322` is exactly that one-line message change; `master...acc9322` touches only `commands.ts` (normaliseTimings + digest), `export.ts` (message), the reviewer-added test, and this wave file — nothing outside scope.

**Lens — measurement fairness:** PASS. The four replacements are exactly the brief's scoped patterns and nothing else; the digest still frames `[stdout, stderr]`, stderr is normalised symmetrically, and the negative in the new test proves substantive differences still hash apart. Named limit (documented, not blocking): `\b\d+ms\b` masks *any* integer-ms token, so a substantive difference like `timeout=500ms` vs `timeout=900ms` collapses to `Nms` — this is a property of the pattern the brief itself scoped, not a departure from it; narrowing it is a scope decision for the head chef. Fractional-ms (`1.5ms` → `1.Nms`) and narrow coverage (`Time: 1.2 s`, lowercase `duration`, ISO timestamps unhandled) mean equivalent runs can still refuse — the safe direction.

**Lens — user experience:** PASS. The refusal reports what was observed — identical exits, differing output, quoted tails from both logs — and attributes no cause. "Behaved differently … than on the untouched base" describes the observation, not a diagnosis such as "a missing selected file". Both 800-char output tails are present.

**Lab-advice checks:** `owner.outputSha256 !== isolated.outputSha256` still gates export (`export.ts:237`) — the comparison was not collapsed to exit codes. `outputSha256` is still computed and recorded verbatim in the paired record alongside the raw `log` (`export.ts:284–285`); `log` is built from `normalize` (path-scrubbing) only — `normaliseTimings` touches the digest, never the recorded text (`commands.ts:174,191`).

**Reviewer-added test is a real check:** 'normalises timing-variable output before hashing, while real differences still hash differently' would fail if `runDeclaredCheck` hashed nothing — `outputSha256` must match `/^[0-9a-f]{64}$/` (rules out empty/undefined) and the substantive-difference record must hash *un*equal to the timing-only pair (rules out a constant digest). It exercises the real `runDeclaredCheck`/`digest` path through `node -e`, not a mock.

**Findings:** none blocking. **Limits:** no end-to-end export pair exercises the normalisation (unit-level coverage only); the `\d+ms\b` masking hole stands as documented above.

Host/model: Devin Desktop, SWE-2.
