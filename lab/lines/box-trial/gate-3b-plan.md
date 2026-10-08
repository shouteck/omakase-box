# Gate 3b plan: native search with execution-first ordering

8 October 2026. Authority: current PROGRAMME.md Gate 3b and owner's LAB.md. This is one session: steps 1 and 2, then a single live pair only if their recorded checks pass. No twelve-pair run or step 4 is authorized here.

## Instrument fixed before measurement

Wrap the native grep/egrep/fgrep/rg/ag/ack/find and git grep invocations in the command shell, retaining their arguments, working directory, stdin, stderr and exit status. Capture the native stdout once. Stable-partition human-readable match records (or intact grep context groups) by whether they refer to a function in the frozen failing-test trace. Mark promoted matches with `[BOX] `. All other output stays present. Binary, machine formats and stdin-only results without a source location pass through unchanged. Directory/file searches can prioritize files containing called functions; keep those separate from line/function metrics. A missing native command stays missing. Compound commands and pipelines use ordinary shell syntax, not a special Box dispatcher. Do not install a replacement search implementation.

The wrapper consults only recorded trace/source identities; qualified function names are remapped on the current source to avoid stale line spans after an edit. Gold is unavailable to ordering. Post-run scoring alone maps the historical fix's changed functions.

For every invocation, record native arguments, cwd, output hashes, exit, native records, reordered records, marks and a multiplicity-preserving equality check after removing only injected marks. Test positive, negative, error, absolute/relative, single-file, context and pipeline cases on an authored fixture before corpus replay. The instruction line is: `Search results marked [BOX] are inside code the failing test ran; all ordinary matches and the whole repository remain available.`

## Corpus and replay

All twelve Gate 3 selected tasks; every actual search invocation in their twelve fresh control records and both Gate 2 published agents' records. Freeze record hashes and include original full actions. Do not mistake `str.find()` in a Python edit for a shell find. Include searches after edits, failed searches, filters on stdin, generated-output searches and searches with no target. No query selection by result.

Replay in pinned prepared images, network off, one task at a time. Each trajectory gets an independent starting worktree; control gets its original test overlay, published agents get their original image base. Replay source-changing actions and recorded git state changes in order. Skip costly package installs/builds/tests; record all skips and their possible effects rather than calling an incompletely reconstructed environment exact. Bound each replay action to 30 seconds; record timeouts/unknown state. Preserve complete native search output before downstream `head`, `tail`, or filters, and also record visible final action output. Do not use final candidate patches as if they were intermediate source states. Verify base HEAD and persist source/worktree hashes for every query. Missing/mismatched state is unknown, not an empty query.

## Metrics and decision (fixed)

Per query: native match count; first genuine matching line within a historically changed function in native/reordered order (one-based); places before it; no-target flag; location/format/state unknown flags. Context lines are not search hits. Report file-only searches separately. Report all invocations, and early/pre-edit and later queries separately.

Per task, on scoreable content queries reaching a target, use median places before it in each order. `Clearly nearer` means at most half as many places, with at least one place saved. Go only if a strict majority of eligible tasks meet that rule, no reachable scored query is demoted, every captured native result multiset/exit/error check passes, and unknown state/format does not make the decision indeterminate. Otherwise stop or report cannot decide; never use unknowns as successes. Report one table and one sentence. Selection/rule cannot change after results.

A fresh sceptic reruns the wrapper checks and a preselected sample: first selected task and first selected Django task, plus any scored regression. It checks corpus completeness/provenance and framing. No repair-agent tokens for steps 1/2. If free evidence fails, no live pair. If it passes, freeze the one-pair model/limits/task and spend cap separately before first agent, then stop after step 3 as PROGRAMME requires.

Session-owned containers/images/scratch only; preserve receipts and remove disposable resources. No product code, master merge, external project message, new service or purchase.

## Compatibility corrections before the final corpus replay

Preliminary free replays are preserved separately, not included in the comparison. Marks are applied only to the final displayed command output; native unmarked reordered records pass through pipelines. Context separators remain between intact reordered groups. Legacy Python images without AST end positions use token-derived function boundaries, checked against current AST and in the actual legacy image. Any ordering fault passes through all native output, is recorded, and blocks a go decision. Mixed expensive actions retain their extracted original search portions with unknown source/environment flags. A sample-only aggregate cannot authorize a live pair; the whole frozen corpus must be accounted for. None of these corrections changes the task selection or frozen ranking/decision rule. No repair model has run.

The real legacy source check was extended to decorated functions after the first legacy corpus pass exposed Python 3.6 lineno semantics. Failed receipts remain in raw/before-decorator-correction; only complete nonfaulting receipts are retained, with their original wrapper version recorded. This is a compatibility repair, not a change to ranking or eligibility. The decorated real-source fixture now passes before the corrected corpus starts.
