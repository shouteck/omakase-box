# Fresh sceptic review

9 October 2026. Reviewed exact clean candidate `d18fca26a7a49edf20a3044b6d8e799f36a5a1ae` on branch lab. Fresh Codex subagent on the Windows host, PowerShell, bundled Python and installed native ripgrep. The session identifies the assistant as based on GPT-6; an exact served model identifier was not exposed. No model-diversity claim.

**Standing: the recorded corpus findings stand, with their stated limits; the complete adapter correctness claim does not stand on this candidate. Two mandatory corrections below.** The recommendation to start with order alone and omit routine badges is supported as a low-footprint design choice, not demonstrated repair benefit.

## Reproduction and independent checks

Kitchen check printed idle. Executed isolated copies of `check.py` and `check-display.py`, preserving candidate fixture files. All 13 and four checks passed, including native getter/setter starts, uncalled nested definitions, stale hash, error/exit and native pipeline filter behaviour. Copies and results are in `sceptic-suite/`.

Executed the recorded `measure.py --output=sceptic-sample django__django-12193 sympy__sympy-16597` with bundled Python `-B` and UTF-8. It completed 22 fresh literal queries and 70 saved invocations. All 70 retained invocation rows match the candidate exactly. Every fresh query has the same native record multiplicity, mark count and path/line/function identity multiplicity as its candidate counterpart. Twelve native streams differ in traversal order. Rank and prefix numbers therefore need not reproduce byte for byte; this is not rank-noise measurement. See `sceptic-sample-comparison.json` and `sceptic-compare.py`.

Independently checked all 587 original compressed literal receipts, compressed byte counts/hashes, native/shown stream hashes and restored-record conservation. Summary instrument hashes and footprint summary hash match. Independently recomputed all footprint aggregate arithmetic, including no-target badge costs, medians and signed net counts. These pass. No extra full thirty-task native rerun was needed.

Read the initial and corrected facts raw receipts directly. Their hashes match. Both have exactly the same 2,066 call key/name set and the same 17 selected-test event sequence, including names, starts, lines and exception types. Global first-seen ordinals differ in 271 entries. Absolute event IDs also vary between processes; the final parent/return stack is internally valid. Q2 reproduces 14 definitions and 670 bytes. Q3 reproduces nine chronological events, 598 bytes, and eight omitted events. The assertion is at test line 96. This is a repository-only selected sequence, not a complete path through external libraries. No Docker rerun was justified by these checks.

My first audit asserted full event dictionaries equal and failed because IDs are process-local. I corrected my own check to compare semantic sequence and independently validate the parent stack. This was a reviewer-check mistake, preserved in this explanation; it does not refute the researcher's stated sequence equality.

## Mandatory corrections

1. **Unsupported multiline matches must remain complete and ordinary.** On actual native `rg -n --with-filename --multiline 'needle = 1[\s\S]*needle = 2' sample.py`, one match spans the ordinary function body through the called function body. The adapter changes its native four-line order to `[2,3,0,1]`, placing the latter half first. Every line survives, but the complete native match is broken. Record conservation alone misses this. Pass through `--multiline` and its `-U` shorthand unless the adapter explicitly supports complete multiline match groups. Add a native counterexample check.

2. **Captured locations must agree with an explicit native filename.** Give the adapter `a.py:5:    needle = 2` plus a captured location identifying `b.py:5`, with identical source text in both files and only `b.py:4` called. It adds `[ran]` to the a.py record using b.py evidence. The adapter validates line and content but does not validate the explicit native path. Reject that conflicting captured location, including separator/match disagreement where applicable. Retain legitimate number-only formats only when the captured path supplies otherwise absent identity. Add an exact source-backed fixture.

Both counterexample commands and native/shown outputs are in `sceptic-audit.py` and `sceptic-audit.json`. They attack the promised exact identity and complete-record fallback, not a new feature. No observed corpus failure is asserted from the artificial contradictory receipt.

## Framing, cost and remaining scope

The candidate honestly distinguishes literal snapshot searches from saved-agent post-processing, historical patch rank from repair quality, and potential prefix savings from actual model input. Full output still returns. Badges always add text. The zero median retained prefix proxy and 53 negative net queries justify withholding routine badges. One-task index/completion timing and one plain/trace pair are reported as anecdotes with limits. No paid service, new model invocation, third-party host execution, live repair, customer interaction or product change occurred in this review.

The owner page's real example and optional facts answers match source-backed records. Its design recommendation can be presented after correcting the two adapter faults. Optional later work includes real shell integration, broader language collectors, stale facts-request validation, timing baselines, and a capped live pilot on owner authorization. None is required to close this bounded prototype review. I did not independently recheck the earlier literature survey; this session adds no novelty or already-exists claim.

Principle applied: **Prove it works**, read from its local skill, changed the review from trusting passing fixture counts to executing native multiline output and auditing raw streams. Throughput checkpoint: n/a, read-only investigation. The local explain-the-number skill named in lab README was absent under that name; the lab's explicit measurement rules governed the arithmetic and calibrated conclusions.

Writer released after this review. No candidate records or code were edited, committed or pushed. A corrected exact candidate requires a targeted follow-up on these two failures and any affected corpus rows before the complete adapter claim can stand.
