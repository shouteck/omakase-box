# Gate 3 instrument

Active protocol: [owner-required Box-first restart](../gate-3-plan.md). The plan was committed and pushed at `7918335` before the first restarted repair agent. The historical passive offer is preserved in `passive/`, with four starts and zero calls in its two completed Box attempts; it is excluded from the new comparison.

`run.py` runs the frozen twelve paired tasks sequentially in pinned, isolated Linux containers. Model: GPT-5.6 Luna, high reasoning; existing ChatGPT sign-in. The control prompt expression is identical to the passive harness. Box alone receives the instruction to begin with box-search and then use ordinary search whenever needed. It gets no listing; only a called search returns matches. Entire repository remains reachable.

`box-search [-F] [-i] PATTERN [PATH...]` is a brokered standalone command through the same run_command tool both arms receive. It searches only frozen source spans the failing test ran, without ranking. No-match and pattern errors count as calls. A mention embedded in an ordinary command does not count. Frozen line offsets can become stale after edits.

For each start, attempt.json retains usage, timing, limits, candidate hashes and native evaluation; steps.json retains exact commands and raw returns; model-events.json retains safe protocol events. Box call followups in attempt.json list every call/result and following commands through the next call or finish. Validity requires at least one recorded Box invocation; first-command adherence is reported separately. Invalid starts remain recorded, not rerun or counted as Box successes.

Native scoring restores benchmark tests in a fresh container. `score.py` reads saved receipts and emits summary.json; --quick emits progress.json without source/gold reading analysis. Historical patches are used only in post-run reading proxies. `check.py` checks artifact hashes, validity and control wording. Raw model events, source/test diffs and logs remain locally under ignored records, with committed hashes; reproduce with the pinned public images and scripts. Agent reruns consume subscription allowance and are a new experiment, not a receipt replay.

Commands from repository root (use the configured Python runtime):

- python lab/lines/box-trial/gate-3/select.py (selection verification; see script output)
- python lab/lines/box-trial/gate-3/check.py
- python lab/lines/box-trial/gate-3/score.py
- python lab/lines/box-trial/gate-3/calibrate.py (owned container fixture; kitchen must be idle)

Astropy 13033 has a confirmed pristine guard failure from expired bundled leap-second data (19/20 guards pass), recorded under baselines/. Its raw native result stays visible but the paired repair outcome is unknown; tasks/dates/warnings are not changed to rescue scoring.
