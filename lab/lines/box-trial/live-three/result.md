# Silent Box continuation: stopped at two against

9 October 2026. Owner-authorized three-pair continuation ended after two new pairs under the frozen early-stop rule. No third pair or further repair start.

**Observed: ordering reached both new Box agents; both arms solved both new tasks, and both Box arms used more reported tokens. The pilot used fewer with the same failed outcome. No comparative advantage established. Review also found a recorder/native stderr fault, so these are as-run observations, not a clean ordinary-native comparison.**

| Pair / task | First | Solved control / Box | Commands control / Box | Tokens control / Box | Searches control / Box | Reordered control / Box | Later opens of promoted results control / Box |
|---|---|---|---|---|---|---|---|
| Pilot: sphinx-doc__sphinx-10614 | control | False / False | 14 / 10 | 200,832 / 182,429 | 8 / 5 | 0 / 1 | — / 1 |
| New: sympy__sympy-16597 | box | True / True | 11 / 10 | 124,686 / 131,614 | 8 / 6 | 0 / 2 | — / 1 |
| New: matplotlib__matplotlib-21568 | control | True / True | 5 / 5 | 52,956 / 70,840 | 2 / 4 | 0 / 1 | — / 0 |
| Third new pair: not run (next candidate by rule: scikit-learn 14087) | Box planned | — | — | — | — | — | — |

The three completed pairs split: Box used fewer tokens once, more twice; no outcome discordance in either direction. Both new Box runs are valid under actual delivered-reordering rule. SymPy is against after the frozen 5%-of-control tie band; Matplotlib also against. Stop decision saved before any third-task preparation. Four starts used 380,096 tokens of the new 2,400,000 ceiling; including pilot, six starts used 763,357. No cap excess, reroll, reroute, timeout, scoring fault or native live search error. Intermediate SymPy errors are retained: both step 6 attempts report missing pytest; control step 7 and Box steps 7/8 fail during import with InconsistentAssumptions from temporary edits; Box step 9 then passes one named test and fails two. These agent-command setup/repair errors are distinct from final scoring and wrapper rejection. No-match searches are also retained. Lead/reviewer use and billing are not measured.

## What actually moved

SymPy step 1 moves assumptions.py code-start 315 and power.py code-start 244; step 3 also moves the assumptions definition. The later step-3 sed read covers the promoted assumptions code. Matplotlib step 3 moves two called pyplot.py lines (code-start 2028) upward, but no later explicit source open is recognized. Those helpers need not be the defect. Opens use the pilot's bounded explicit-sed heuristic, checked against raw commands; control has no promoted results, so its dash is not a claim about what it read. No cognition or causation claim.

All recorded search results survive before the common 16 KB returned-text limit; silent reordering adds no stdout bytes to the recorded answer, instructions/marks/facts tool absent, whole repository available. Matplotlib Box step 3 is actually truncated: stdout 4,003 bytes plus recorded stderr 22,925 bytes; both promoted pyplot lines survive early in delivered stdout. No new SymPy answer is truncated; pilot Box step 2 is. Conservation refers to recorded pre-cap streams, not every byte the agent receives or equivalence to unwrapped native execution. The shared recorder adds stderr relative to direct native execution on one reviewed live pipeline; silent display reordering alone adds no stdout bytes. Same copied recorder/display/source-identity implementation as the reviewed pilot; only task, first-arm order, and total-budget enforcement differ. Same GPT-5.6 Luna low, byte-identical within-pair prompts/base/tool schema and native immutable-test grading.

## Selection, safeguards and faults retained

Selection/stop protocol pushed at 8471a3c before task checks. Descending public failures, then longest published run, then ID; three projects excluding Sphinx planned. Astropy candidate excluded without repair because gold itself leaves one unchanged expired leap-second guard red (19/20). SymPy admitted first, Matplotlib second. This is selected public work, not a random or held-out population sample.

Per task gold solves, empty fails, production mutation breaks named guards. SymPy: 3 failing and 74 guards. Matplotlib: 4 failing and 73 guards, with native lossless node mapping. Every retained recorded search command replayed: SymPy 43 actions /47 available captures /7 reorderings; Matplotlib 20/20/4. Historical-command native comparisons preserve exits, stderr bytes and stdout multiplicities for those recorded commands. They did not cover the differing stderr in the actual Matplotlib live pipeline described below. Wrapper source remains the pilot copy. Launches bind to pushed exact source commits 62aced1 (SymPy, Box first) and 55a6419 (Matplotlib, control first). Source locks, prompts, full events/commands/native and shown results, actual candidate patches and hashes retained in task siblings.

Before any repair, generated path quoting caused a syntax error; fixed and original preserved. First SymPy guard mutation chose an import-time function and prevented tests starting; preserved, corrected to functions first observed after a passing-test entry, all scoring repeated. Historical Matplotlib guard trace contains no test execution due old truncated IDs; preserved failed probe, fresh actually-passed guard trace used and all checks repeated. These are scoring-safeguard corrections, no Box change or expected test outcome change. Verbatim SymPy issue text retains its original trailing spaces; a whitespace check reported those, and the original task prompt was kept. Automatic approval review initially rejected launch authorization/data scope; verified user-invoked LAB.md programme chain and public-only benchmark exposure, then same action approved. Zero starts before acceptance.

## Instrument fault found in actual-command review

Fresh replay of Matplotlib Box step 3 gives identical exit/stdout and the same promoted source identities, but direct native stderr is 4,316 bytes versus recorded 22,925: 189 extra binary-file notice lines. capture.py buffers a search to completion before emitting to head; a direct native pipe stops grep earlier. The wrapper therefore changes the native answer and, here, its truncation/context cost. Both arms shared that recorder, so the recorded display-only arm difference and descriptive signs survive, but a clean ordinary-native baseline does not. This is a real instrument fault missed by passed historical-command safeguards. Original instruments, failed review assertion, full native/recorded streams and hashes are preserved; no retrospective pass or agent rerun.

The session is additionally stopped for this fault. Before any future ordinary-native comparison, fix streaming and verify actual pipelines with no agents or model tokens. This session makes no such instrument fix and authorizes no further pair.

## What these runs support

Ordering integrates with live agents and need not result in a later open or fewer reported tokens. The outcome/tokens split is compatible with no effect or a small effect. It cannot measure a population saving, disprove every benefit, prove harm caused by ordering, or validate the never-worse hypothesis. One run per selected task, stochastic provider behaviour, no noise estimate, prepared test overlay visible, public tasks possibly known, order alternated only among performed new pairs. Shell coverage remains bounded; explicit executable/Python searches bypass it and unsupported/context forms fall back.

The illustrative four-fair-signs one-in-eight calculation is not invoked as a p-value: this set is selected and stopped sequentially after a post-pilot decision. No percentages presented as measured savings. No more pairs authorized here.

## Review and closeout

Fresh sceptic reviewed exact 2e85d53, reread complete saved records, independently rescored all six actual patches including pilot, and verified recorded delivery, source identities, conservation, accounting, selection and early stop. All scores match. Its actual-command replay found the instrument fault above; mandatory intermediate-error and truncation corrections are incorporated. [Independent review](sceptic.md), [review receipt hashes](review-manifest.json). The reviewer's account usage limit interrupted its final audit; the owner resumed the task, the same reviewer completed from saved state without repair/scoring reruns or purchase. The review report's phrase "approval-service usage-limit" refers to this account inference limit.

All original scientific raw/manifests remain unchanged locally. Four exact session-owned image refs and four verified empty own scratch directories removed, container absence verified; no global prune. [Cleanup](closeout-cleanup.json). No product code, new purchase/key, project message or other line resumed. Third candidate neither admitted nor prepared. No further comparison until the owner/CTO decides after an instrument correction; no superiority or causal saving/harm claim.
