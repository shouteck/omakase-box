# B0.1 drift and capability-gap report

Wave W001, approved by the CEO (verbatim message "Approve") at 2026-10-04T07:11:18Z against brief .execution/box-v4/briefings/W001.md revision 2026-10-04-r4, digest sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1. Approval record: .execution/box-v4/approvals/W001-approval.json. This authority covers B0.1 only; docs/evidence writes only; no product code.

Prepared 2026-10-04 by the B0.1 worker under `devin_portable_pstack_adaptation`. All Git use was read-only. No installs, builds, test runs, dev servers, commits, stashes or coordinator scripts were executed.

## 1. Git reality

Commands actually run (verbatim) and observed outcomes:

- `git -c safe.directory='*' -C C:/Users/shout/Desktop/Projects/private-task-mvp rev-parse HEAD` → `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c`
- `git -c safe.directory='*' -C C:/Users/shout/Desktop/Projects/private-task-mvp status --porcelain=v1 -b` → branch `## master...origin/master`; dirty paths (names only, no content inspected):
  - Modified: `.execution/box-v4/briefings/W001.md`, `.execution/box-v4/state.json`, `.execution/box-v4/waves/W001.json`, `AGENTS.md`, `START.md`, `docs/box-v4/PSTACK.md`
  - Untracked: `.devin/`, `.execution/box-v4/approvals/W001-approval.json`, `.execution/box-v4/briefings/archive/`, `.execution/box-v4/setup/`, `docs/box-v4/DEVIN-SETUP.md`
  - Plus this task's own new deliverables (docs/box-v4/reconciliation/, .execution/box-v4/evidence/B0.1/) and the REUSE.md correction, which will appear dirty after this report.
- `git -c safe.directory='*' -C C:/Users/shout/Desktop/Projects/private-task-mvp log --oneline -n 10` → two commits:
  - `2ad7e35` Preserve byte-bound Box evidence across Git checkouts
  - `53ec783` Establish existing MVP baseline and Box kitchen governance

The dirty set is S001/W001 governance material, consistent with the approval record's `baseRevision: 2ad7e35c7cebc9141503c3042fb81edbb40cbd0c`. A real committed baseline now exists; the "plan a reviewed synthetic/project baseline" obligation is satisfied by recording it — creating additional commits is outside B0.1's read-only Git scope and the approval's `gitCommitsOrMerges: false`.

### Stale claims corrected

| Stale claim | Location | Reality at 2026-10-04 |
|---|---|---|
| "Git inspection found unborn master with no commits and the project files untracked" | docs/box-v4/REUSE.md, first paragraph of "Gaps that change the next wave" | HEAD `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c` on master, two commits; corrected in-place with a dated correction note (original text preserved) |
| `gitCommit: null`, `gitStatus: "unborn master; working files untracked"` | .execution/box-v4/preservation-baseline.json | Dated 2026-10-04 pre-commit snapshot; NOT edited (read-only). Documented here as resolved drift: a real baseline commit now exists and all 426 baseline digests still match |
| "Git base is explicitly absent until a real commit exists" | tasks/box-v4-task-graph.json, B0.1 acceptance bullet | Graph text predates baseline `2ad7e35`. Recorded here as graph drift; the graph is canonical state and was NOT edited. For the independent reviewer: the underlying intent — no product writes and no fabricated history — is satisfied; the literal wording is stale |

## 2. Metadata drift

- Preservation baseline vs current bytes: **all 426 of 426 entries match byte-for-byte** (0 mismatched, 0 missing). Verified by full recomputation, not a sample — every baseline path was re-hashed by `.execution/box-v4/evidence/B0.1/census.mjs` into `.execution/box-v4/evidence/B0.1/census-digests.json`.
- New files under product roots not in the baseline (6, all governance-adjacent templates, expected): `templates/box-v4/briefing.md`, `templates/box-v4/dispatch.md`, `templates/box-v4/handoff.md`, `templates/dispatch.md`, `templates/evidence.json`, `templates/handoff.md`.
- Governance drift since the snapshot (expected and preserved, not a defect): `AGENTS.md`, `START.md`, `PLAN.md`, `docs/box-v4/**`, `.execution/box-v4/**`, `.devin/**`, `tasks/box-v4-task-graph.json` postdate the baseline; `docs/DECISIONS.md` (`f306bda0…`), `.execution/state.json` (`80a58bbe…`) and `tasks/task-graph.json` (`eb6dc7de…`) are byte-identical to the legacy snapshot manifest digests — legacy history untouched.
- Legacy snapshot integrity: all 14 entries in `docs/legacy/m0-m9-20261004/manifest.json` verified MATCH by recomputation (START/AGENTS/PLAN/README, docs/SPEC/ARCHITECTURE/COMPOSITION/SECURITY/EVALUATION/DECISIONS, tasks/task-graph.json, .execution/state.json, .execution/PROTOCOL.md, templates/dispatch.md).
- Legacy evidence trees intact by enumeration and hashing: `.execution/handoffs/` = 63 files (all digested), `.execution/evidence/` = 1420 files (all 121 revision manifests referenced by the 32 task records digested — 0 missing), `.execution/drafts/` = 114 files (counted only).
- `.execution/box-v4/briefings/W001.md` current sha256 `573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1` — matches the approval record's bound brief digest exactly.

## 3. Runtime / model capability gaps (actual observations only)

- **Cursor-native pstack: absent in this host.** This worker runs under Devin Desktop with adapter `devin_portable_pstack_adaptation`. Native Cursor skills/Task/orch store were not and cannot be verified from here; that gate stays open for B0.2.
- **Devin adapter verified by S001 only.** `.execution/box-v4/setup/S001/receipt.json` records local `box-pstack` v0.11.3-box.1 (source commit `e9e225bb1f3362a51ac4e489d16f2d7b13c248ff`), observed model "SWE-2 High", nested `run_subagent` at depth 2 under custom rehearsal profiles, exact-candidate review pass on a synthetic fixture, and `STARTLiveRouting` passing only under explicit read-only rehearsal constraints. S001 is setup authority; it does not prove product dispatch (receipt's own `authority` block: `W001Approved:false, productWorkApproved:false, B1CodingProof:false, cursorNativeProof:false`).
- **Model: deliberately unpinned.** Actual Devin configuration/router selects the model; S001 observed SWE-2 High for all agents (`modelDiversity:false`). No model diversity is claimed. This worker does not assert its own model identity beyond what the host reports.
- **Hostile KVM/libvirt runner: still absent.** M5.2 and downstream records remain blocked on the operator-owned dedicated Linux KVM host; open_trusted does not clear that gate.
- **Unavailable checks (reported, not passed):** no product test suite was run for this census (read-only scope); `verify:mvp`, `test:box-*` commands are unimplemented/future; Docker/WSL runtime status was not re-verified this session; live-model quality unverified; human pilot not conducted; real-runner evidence unavailable. None of these is a pass.

## 4. Reconciliation outcome against acceptance

- 18 checked / 14 blocked records reconciled against current source: all 32 write-path glob sets resolved and digested; historical approvals preserved as history; no new approvals invented.
- Snapshots and historical handoffs verified intact by reading/hashing (sections above), not assumed.
- No product changes, no process startup, no legacy coordinator writes; only the approved B0.1 paths were written.
