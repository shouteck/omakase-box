# W002 / B1.1 — independent reviewer verdict: `not_accepted`

Reviewer: distinct `box-reviewer` (this dispatch). I did not implement, stage or repair any candidate byte; all hashes below were recomputed by me on the current working tree and cross-checked against the staged workspace mount `C:/Users/shout/AppData/Local/Temp/w002-b11-stage` (byte-identical, `cmp` clean on all 16 files).

## Authority binding (recomputed)

- Wave `W002`, task `B1.1`, plan `box-v4-2026-10-04.1`, adapter `devin_portable_pstack_adaptation`.
- Brief `.execution/box-v4/briefings/W002.md` r1 — recomputed SHA-256 `44e984be1e01abfed357945f196f16738e30c43de1e5bb0e2adcdc891d5a7ac9`, matches approval and wave records exactly (immutable bytes intact).
- Approval `.execution/box-v4/approvals/W002-approval.json`: human CEO `Approve`, observed `2026-10-04T08:35:06.1650860Z`, bound to the same digest and base `cd3feaf0c467df6c4b9734974722f8471f0da891`.
- `waves/W002.json`: status approved, `holdEvents: []`, `revocationEvents: []`, digest/base match. `state.json` shows B1.1 `ready` (not accepted) — consistent.

## Commands actually run by this reviewer (inside `w002-b11-ws`, `/workspace`)

| Command | Exit | Observed result |
| --- | --- | --- |
| `node scripts/pnpm.mjs test:box-contracts` | 0 | 7/7 passed (box-schemas 6, boundary 1) |
| `node scripts/pnpm.mjs test:box-auth` | 0 | 7/7 passed; support.ts creates a fresh `w002_b11_test_*` DB per file and runs the real drizzle migrator over 0001–0012 |
| `node scripts/pnpm.mjs build` | 0 | tsc + vite builds completed |
| `node scripts/pnpm.mjs check` | 1 | tsc clean; boundary check passed (59 files); bootstrap suite passed; auth suite 25/30 — 5 environment-dependent failures |
| `node scripts/pnpm.mjs test:auth` | 1 | 25/30 passed, 5 failed: `tests/auth/persistence/{auth,workflow,lifecycle,migrations}-live.test.ts` need the legacy compose runtime (no docker socket inside the isolated workspace); `tests/auth/bootstrap/browser-cookie.test.ts` needs Playwright chromium (`.runtime/browsers`, excluded/no-download per policy) |

Failed/unavailable is not pass. The failures are environmental, not candidate-code regressions (25 non-environmental auth tests pass, including policy consumers), but the required commands did not pass on this candidate in the approved workspace.

## Scope findings

1. **Out-of-scope write — `scripts/vitest.config.mjs`** (`bcb91022…60`): adds `testTimeout: 30000`. Not in worker-exclusive paths and not in any named shared lease (`package.json` scripts, `scripts/boundaries.mjs`, `pnpm-lock.yaml` workspace-link only). It falls in the forbidden "unrelated tool config" class. Worker disclosed it, but disclosure does not grant scope. **Scope violation.**
2. **Evidence defect — `candidate-manifest.json` missing.** Required worker evidence names `candidate-manifest.json`; only `candidate-manifest.txt` exists. Content (hashes) verified correct — every hash I recomputed matches — but the mandated file is absent.
3. `_journal.json`: entries idx 0–11 preserved semantically (whitespace-only reformat of the whole file; `git diff -w` shows only the idx-12 append). Content compliant; formatting rewrite technically exceeds "idx 12 only" — minor.
4. In-scope writes verified appropriate: `package.json` (two scripts only), `policy.ts` (box.* actions appended, external perms untouched), `boundaries.mjs` (`packages/box-` prefix added), `0012_open_box_foundation.sql`, `packages/box-contracts/**`, `boxes/store/**`, `tests/box/**`. `services/private-api/db/schema.ts` unchanged; no bootstrap/server/main edits; no suite.mjs/workspace.mjs edits; `pnpm-lock.yaml` unchanged; no new dependencies.

## Behavior review against independently derived expectations

Verified in source and exercised by the 7/7 real-DB tests: immutable version/content hashes with format CHECKs and `box_record_immutable` triggers; `open_trusted`-only payloads; behavior artifact distinct from intent (provenance only); `open` requires an exact-hash owner behavior approval; revision invalidates approval (new version is draft, approval bound to old version); `FOR UPDATE` optimistic head/attempt reads with `stale_version`/`invalid_transition`; `box_operation_keys` idempotent replay and same-key-conflict rejection; scoped tokens bound to box/attempt/capability; separate `box_review_decisions` and `box_merge_approvals`/`box_merge_records`; executor self-behavior-approval, self-review and self-merge all refused server-side; author/owner role checks with session+CSRF revalidation inside every transaction; `assertNoRestrictedFields` refuses payment/reward/disclosure/KVM-keyed contamination; migration replays cleanly through idx 12 on fresh synthetic DBs. No route/bootstrap leakage. Implementation is substantive and matches the approved Q2/Q3 choices.

## Workspace/policy review

Recipe and preflight comply with the approved policy: cached pinned image IDs match the brief exactly (`99fc47…65c9`, `postgres:17-bookworm@sha256:639ab7…b652`), no pulls/installs/downloads, non-root `1000:1000`, `--cap-drop ALL`, `no-new-privileges`, read-only root, bounded tmpfs + single staged bind mount excluding `.runtime`/`.env*`/`.git`, internal network `w002-b11-net` (no egress/ports), 2 GiB/2 CPU/256 pids and 256 MiB/0.5 CPU/128 pids limits, disposable tmpfs DB, synthetic credentials. All five W002 resources (`w002-b11-ws`, `w002-b11-db`, `w002-b11-net`, `w002-b11-srcimg`, `w002-b11-stage-helper`) observed still present for inspection; nothing destructive performed.

## Governance review

Root's W002 edits are consistent: frozen brief bytes unchanged (digest match), approval binds the exact digest/base, wave/state statuses and leases coherent, no scope expansion observed. Governance JSON was not itself independently re-reviewed as a candidate; reported as observed.

## Pilot gates

- G1 pass — actual approval bound to frozen digest.
- G2 partial — sole-worker receipt exists, but the required `candidate-manifest.json` is absent (`.txt` instead); hash content verified correct.
- G3 pass (this verdict) — distinct reviewer bound identical recomputed bytes.
- G4 pass-with-defect — receipts persisted; manifest filename nonconforming.
- G5 degraded/not passed — START resumption undemonstrated.

## Verdict

`not_accepted`. Blocking reasons: (a) required checks `check` and `test:auth` did not pass (environment-dependent failures — recorded as unavailable/failed, not pass); (b) out-of-scope write to `scripts/vitest.config.mjs`; (c) missing required `candidate-manifest.json`. Remediation within scope: restore `vitest.config.mjs` to base bytes or obtain lease coverage, produce the JSON manifest, and obtain a passing `check`/`test:auth` in an environment where the live-persistence and browser fixtures can run (or an explicit approved reclassification of those checks). Any candidate change reopens this review.
