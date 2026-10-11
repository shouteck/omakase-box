# B0.1 candidate handoff (worker → lead; NOT the canonical handoff)

Wave W001, approved by the CEO (verbatim message "Approve") at 2026-10-04T07:11:18Z against brief .execution/box-v4/briefings/W001.md revision 2026-10-04-r4, digest sha256:573e2e68dddd3b7d50414f815eb168241b1e830f09835f37db6dcd5642ae45d1. Approval record: .execution/box-v4/approvals/W001-approval.json. This authority covers B0.1 only; docs/evidence writes only; no product code.

Format follows templates/box-v4/handoff.md. Root finalizes `.execution/box-v4/handoffs/B0.1.md` only after independent revision-bound acceptance; this file is the worker's bounded candidate.

## Identity and candidate binding

- Task/wave: B0.1 / W001; station: assurance_research; worker: B0.1 implementation worker under `devin_portable_pstack_adaptation` (Devin Desktop; model deliberately unpinned — host/router chooses; S001 observed SWE-2 High).
- Base revision: `2ad7e35c7cebc9141503c3042fb81edbb40cbd0c` (master), uncommitted S001/W001 governance artifacts present (paths listed in drift-report.md).
- Candidate = this evidence directory plus docs/box-v4/reconciliation/{census.md,drift-report.md} and the single dated correction inside docs/box-v4/REUSE.md (~line 18). Exact per-file sha256 digests are recorded in worker-receipt.md (computed after final writes) and in census-digests.json (731 repo files).

## Approved paths and actual writes

Approved: docs/box-v4/REUSE.md, docs/box-v4/reconciliation/**, .execution/box-v4/evidence/B0.1/**.
Written: docs/box-v4/reconciliation/census.md; docs/box-v4/reconciliation/drift-report.md; docs/box-v4/REUSE.md (one correction paragraph, original text preserved); .execution/box-v4/evidence/B0.1/{census.mjs,census-digests.json,worker-receipt.md,candidate-handoff.md}. Nothing else was written; `.execution/box-v4/handoffs/B0.1.md` was deliberately not created.

## Interfaces and predecessor evidence consumed

- Legacy census inputs: `.execution/state.json` (32 records: 18 checked/14 blocked), `tasks/task-graph.json` writePaths, `docs/box-v4/REUSE.md` audit table, `docs/DECISIONS.md`, `.execution/box-v4/preservation-baseline.json` (426 files — 0 drift), `docs/legacy/m0-m9-20261004/` snapshot (14/14 manifest matches), `.execution/handoffs/` (63 files) + `.execution/evidence/` (1420 files; all 121 referenced revision manifests hashed).
- Capability inputs: `.execution/box-v4/setup/S001/receipt.json` + native-evidence.json; `.devin/config.json` permission policy; `.execution/box-v4/approvals/W001-approval.json`.

## Environment and commands

Windows host, Node v24.11.0, node:crypto sha256 over raw bytes; read-only Git with `-c safe.directory='*'` overrides; traversal excluded node_modules, dist, .git, .runtime, secrets, .env*. Verbatim commands and outcomes are in worker-receipt.md. No product tests were run — none are required to claim this inventory, and unavailable checks are listed as unavailable in drift-report.md section 3.

## Known gaps and next-agent context (for B0.2 / W002)

- Independent review is still required: this is an unverified candidate; statuses were copied from legacy state, not re-approved. Reviewer should spot-check ≥1 previously approved (e.g., M1.1), ≥1 checked/stale-metadata (e.g., M0.1) and ≥1 runner-blocked (e.g., M5.2) component plus the preservation manifest.
- Graph drift recorded, not fixed: B0.1 acceptance text says "Git base is explicitly absent until a real commit exists" — stale post-baseline; CTO decides whether the immutable graph needs a revision.
- Open for B0.2: Cursor-native pstack absent on this host; native orch store unverified; KVM runner absent; no model diversity; `verify:mvp`/test:box-* commands unimplemented. B0.2 owns the runtime-contract and shared-integration-path inventory next.
- Source did not change after any review: no independent review has occurred on this candidate yet.
