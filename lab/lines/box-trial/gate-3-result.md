# Gate 3: required Box search, paired live trial

Plan fixed and pushed at `7918335` before restart. Same twelve tasks, GPT-5.6 Luna with high reasoning, same command/token/time limits and unchanged control prompt. Box alone is instructed to begin with box-search and fall back to ordinary search; the full repository stays available. No listing enters context. Every called result and following command is recorded.

| Fixed task | Selection | Control | Box | Box calls | Total tokens control / Box | Steps control / Box |
|---|---|---|---|---:|---:|---:|
| astropy__astropy-13033 | published failure | unknown | invalid (no call) | 0 | 95,176 / 107,527 | 8 / 9 |
| astropy__astropy-14539 | long published run | pass | pass | 4 | 207,894 / 365,584 | 11 / 19 |
| django__django-12193 | published failure | pass | pass | 1 | 73,067 / 91,940 | 9 / 10 |
| django__django-14752 | quick published solve | pass | pass | 1 | 53,081 / 64,453 | 5 / 8 |
| django__django-15467 | quick published solve | pass | pass | 3 | 39,032 / 108,138 | 5 / 14 |
| matplotlib__matplotlib-21568 | published failure | pass | pass | 1 | 260,275 / 257,523 | 11 / 15 |
| scikit-learn__scikit-learn-12585 | quick published solve | pass | pass | 1 | 42,195 / 67,583 | 5 / 9 |
| scikit-learn__scikit-learn-13124 | quick published solve | pass | pass | 1 | 159,052 / 250,388 | 10 / 14 |
| scikit-learn__scikit-learn-14087 | published failure | pass | pass | 1 | 179,950 / 308,813 | 12 / 18 |
| sphinx-doc__sphinx-10614 | published failure | pass | pass | 1 | 719,483 / 312,333 | 26 / 15 |
| sphinx-doc__sphinx-11445 | published failure | pass | pass | 1 | 257,579 / 173,516 | 16 / 13 |
| sympy__sympy-16597 | published failure | pass | invalid (no call) | 0 | 620,565 / 1,028,692 | 21 / 28 |

**Sentence:** on 10 scored valid pairs, required Box use gained 0 repairs and lost 0; among 10 pairs both solved, the median token change was 41.6% more tokens per task (paired median), so this trial does not establish that the Box is better.

## Evidence and decision

There were 24 fresh initial starts: 10 valid Box attempts and 2 invalid. Validity requires an actual standalone call at least once; no-match/error responses count as calls. Zero-call attempts remain recorded, never counted as Box successes or ordinary failures. First-command adherence is separately recorded in checks.json; rejected combined commands are not executed Box calls. All fifteen executed Box calls returned no matches or a usage error, so no positive Box source match entered agent context. This tests the observed query strategy and interface, not the value of useful matches. The final zero-call Box attempt reached its token cap and remains invalid even though native repair tests passed.

Success discordance exact two-sided p=1.0. Token sign-test p=0.34375, 3 cheaper and 7 dearer. Median Box-minus-control steps on jointly solved pairs: 4.0; elapsed seconds: 18.9. Tokens include cached input and output reasoning; they measure usage, not an API invoice. Fresh repair agents reported 5,843,839 tokens in total, including invalid starts. The capped final Box attempt reported 1,028,692 (28,692 above the cap from one in-flight response). No additional paid service, purchase or API key was used; existing ChatGPT allowance was explicitly authorized. Lead/reviewer token overhead is outside the paired repair-agent comparison. Pre-fixed repeat decision: **stop without repeats**. Missing/invalid pairs cannot support a complete superiority or no-harm claim.

## Preserved findings and corrections

The owner/CTO stopped the optional-tool design. Its four starts are archived in passive/: two completed Box attempts with zero calls; one completed control and one interrupted control with partial lower-bound usage and no evaluation. The bounded finding is **a passively offered tool was not called**. None enters the restarted comparison.

An earlier export against HEAD picked up a pre-existing pyproject.toml chunk. It was removed only by byte-identical prepared-baseline comparison, with original receipts preserved. Future exports checkpoint the exact prepared test-overlay worktree. No repair agent was rerun for this correction.

The first fixed task has a confirmed pristine guard failure from expired bundled leap-second data (19/20 guards pass). Raw candidate results remain visible; paired repair outcome is unknown. No dates/warnings/replacement tasks are changed. Native scorer corrections for Django descriptions and Matplotlib truncated parameter IDs preserve every guard, original evaluation and candidate hash. Only grading is replayed, using unique base-test description mapping or lossless native collection; no agent reruns.

## Limits

Twelve selected public Python tasks, one initial pair each, are exploratory, not a solve-rate estimate or a test of all Boxes. Models may know these tasks. Agents receive failing tests unlike published records. Stronger-model results are context, not a concurrent arm: the published GPT-5.2 Codex record solved five of the selected twelve, in a setting without the failing test given. A gap-closing claim cannot be attributed to Box when the live control also solves every scored valid pair; this setting has a repair-success ceiling.

The standalone broker rejects combined Box commands; retries and help/no-match responses consume real steps/tokens. Their costs are included and can reflect interface friction as well as relevance. Frozen production-function spans can become stale after edits. Outside reading stays available and is not assumed waste. Elapsed time includes setup/protocol overhead and is noisy.

Reading proxies in summary.json reuse Gate 2's base-source mapper: first reaching a changed function or target file, then text/steps until first recognized edit. Python reads/writes may be missed and offsets can shift. Returned text is not cognition or billable input. No ranking technique or product feature was built.

On the ten valid jointly solved pairs, the reading proxy records a median 1 step / 339 returned characters before reaching the fix for control and 3 / 487 for Box (ten observations each). Between first reach and recognized edit: control 5 steps / 32,916 characters (ten), Box 5.5 / 36,635 (eight). Missing recognized edits and differing coverage prevent a clean paired interpretation of that second comparison.

Four quick-solve tasks are marked separately. Their paired token increases are 21.4%, 177.0%, 60.2% and 57.4%; strict no-harm is not demonstrated. Their costs must meet the strict minimal instruction allowance before no-harm can be claimed; equal repair outcomes alone do not establish harmlessness. Without repeats there is no steadiness measurement. Missing pairs prevent a complete no-loss claim.

## Reproduction and principles

[Instrument and receipts](gate-3/README.md). check.py verifies control wording, call validity, followups and artifact hashes. score.py recomputes from saved receipts, with historical patches only in post-run reading proxies. Raw events, diffs and logs remain locally under ignored records with committed hashes. Grading replay never runs an agent.

Model the Domain separated actual use, instruction adherence and repair success. Sequence Verifiable Units froze the amended plan before fresh starts and preserved the passive design separately. Prove It Works requires independent receipt replay and native fixture checking. No product transfer; Gate 1c and other lines remain unstarted/paused.

## Sceptic

[Independent review](gate-3-sceptic.md): the bounded claim stands. Fixed selection and the entire saved measurement reproduced exactly; all 316 active/passive artifact hashes matched; native fixtures and a positive actual-scope query passed. The reviewer confirmed the empty-query strategy, command-interface friction, success ceiling and non-random adherence exclusions prevent a universal conclusion about Box value or population cost. Stop without repeats stands.
