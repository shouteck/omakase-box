# B0.2 — B1.1 one-unit orchestration pilot recipe

Wave W001, approved by the CEO (verbatim message "Approve") at 2026-10-04T07:11:18Z against brief `.execution/box-v4/briefings/W001.md` revision 2026-10-04-r4, digest sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1. Approval record: `.execution/box-v4/approvals/W001-approval.json`. Scope: B0.2 only; docs/evidence writes only; no product code.

Prepared 2026-10-04 under `devin_portable_pstack_adaptation`, base commit `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c`. This is a recipe for a future separately-approved wave (B1.1 requires its own brief + CEO approval — nothing here dispatches anything). Task: B1.1 "Implement the versioned Open Box aggregate and transitions" (`tasks/box-v4-task-graph.json`), writePaths `packages/box-contracts/**`, `services/private-api/boxes/store/**`, `services/private-api/db/migrations/**`, `tests/box/contracts/**`, `tests/box/auth/**`.

## 1. Dispatch chain

`root CTO → box-platform-lead → box-worker` — foreground, serialized, **one child at a time** on this 16 GB host. Verified available: depth ≤2 with `max-nesting: 2` lead profiles (S001 receipt dispatches `86e9c015`/`41c04fd6`/`d7d9c915` on a synthetic fixture). Unproven for product work — this pilot is the proof.

Every dispatch is a standalone brief (children inherit nothing) containing:

- Authority block: wave ID, immutable brief path+revision+sha256, approval record path, verbatim approval message/timestamp, task ID(s), base revision.
- Full standing orders (all 14) copied verbatim.
- Exact write scope: the task's writePaths plus any named shared paths under a named lease (for B1.1: `package.json` scripts / `_journal.json` / `policy.ts` per `integration-paths.md`).
- Forbidden paths, stop conditions, report path, timebox, model/resource policy.

## 2. Bounded worker output

The `box-worker` child:

- Writes ONLY inside B1.1 writePaths plus named leased shared paths. One writer per candidate/worktree.
- Returns a bounded receipt: file list with per-file sha256, commands actually run with outcomes, facts verified, deviations, limitations. No acceptance claims, no canonical-state writes.

## 3. Distinct reviewer

A separate `box-reviewer` dispatch (not the worker, not the lead's own implementation):

- Receives the original task scope + the worker's exact candidate manifest; recomputes digests — verdict binds identical bytes.
- Runs only approved checks: future `node scripts/pnpm.mjs test:box-contracts` and `node scripts/pnpm.mjs test:box-auth` once registered (B1.1 deliverable via tooling lease), plus existing `node scripts/pnpm.mjs check` / `build` as available. Missing scripts are `unavailable`, never pass (observed convention: `scripts/suite.mjs` exit 2 `{status:'unavailable'}`).
- Reviewer verifies behavior against independently derived expectations, not the worker's stdout.

## 4. Durable receipt

Persist under `.execution/box-v4/evidence/B1.1/`: worker receipt + reviewer verdict, each bound to wave/brief sha256 and the exact candidate manifest (file list + sha256 per file, or commit ID if the wave authorizes commits — W001's approval did not; a coding-wave brief must decide).

## 5. START.md resume behavior

Per START.md "Hold and resume" + `.execution/box-v4/PROTOCOL.md`:

- On interruption, STOP new dispatch; active children checkpoint writes safely; preserve candidates/receipts.
- A resumed session reconciles: unrevoked approval + unchanged scope/placement/permissions + matching wave/brief digest → resume only the exact unfinished wave. Held → requires fresh human resume authorization against the same brief. Revoked → fresh approval.
- Evidence proving resume worked: reconciliation output matching (a) the bound brief digest, (b) the persisted approval record, (c) the candidate manifest on disk — plus durable evidence that no dispatch occurred while held/unapproved.

## 6. PASS/FAIL gates — all must pass before ANY parallel implementation fan-out

Ordered; each is binary and evidence-bound. Fan-out (more than one concurrent implementation worker anywhere in the programme) is forbidden until G1–G5 all pass.

- **G1 — Wave approval.** B1.1's wave approval recorded against an immutable brief digest (approver evidence, timestamp, scope) in `.execution/box-v4/approvals/`. FAIL if approval is missing, pending, bound to different brief bytes, or inferred.
- **G2 — Single worker receipt.** Exactly one `box-worker` dispatch returns a receipt bound to an exact candidate manifest (complete file list + per-file sha256). FAIL if zero, two+ concurrent workers, or a receipt with no digest binding.
- **G3 — Distinct-reviewer verdict.** A reviewer other than the worker (distinct agent dispatch) returns a verdict bound to identical bytes — recomputed digests match the worker manifest exactly. FAIL if reviewer is the same agent, verdict covers different bytes, or digest recomputation was skipped.
- **G4 — Durable persistence.** Worker receipt + reviewer verdict persisted under `.execution/box-v4/evidence/B1.1/` bound to wave/brief hash and candidate manifest. FAIL if either lives only in chat.
- **G5 — Resume/reconciliation.** START.md resume behavior demonstrated per section 5, OR explicitly recorded as a known gap with a `degraded` label (e.g. session could not be interrupted/restarted in the window). FAIL silently is not permitted — an undemonstrated resume must be named as a gap, not assumed.

## 7. Flattened-dispatch fallback

If `run_subagent` nesting is unavailable in the actual host when the wave runs: the station lead authors the same standalone worker brief and the root CTO performs the single dispatch on its behalf (KITCHEN.md flattened topology). This is a labeled `degraded: flattened dispatch` mode — the lead loses its dispatch role but brief authorship, one-writer ownership, distinct review and all G-gates still apply. G5 records the degraded label alongside the resume result. An absent implementation worker entirely means the CTO prepares governance only and reports the gap — the CTO never writes product code.

## 8. What this pilot proves (and does not)

Passing G1–G5 proves: approved-scope dispatch through the real adapter, bounded worker output, distinct-reviewer binding, durable receipts, resume behavior — enough to fan out under later approved waves. It does NOT prove: Cursor-native pstack (absent on this host), Codex fallback (unrehearsed), model diversity (all observed agents SWE-2 High), live-model quality, or hostile-runner capability (KVM absent — unchanged later-profile blocker).
