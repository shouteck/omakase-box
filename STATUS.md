# Status

Updated by the CTO on 15 October 2026 at the BT17 close.

## Now

- **BT17 completed.** Reviewed tip `8631d08` (code commit `736d09c`), independent PASS ui-verified — the pass ran a fresh full verify (`1036s`) and re-measured the after column byte-identically. Merged `c5fdd79`. Every bounty command's normal output is now one outcome line, only facts needing attention, and one `next:` line: 290 → 243 lines / 26.5k → 20.7k chars over the standard journey. Detail sits behind `--full`; standing explanations are said once via a `said` map in owner settings and live permanently in `help`/`describe`. A new guard test (`bt17.test.ts`) holds each command to a line/char budget.
- Cold fresh posting and collecting agents (dispatched by the head chef, worlds under a temp root now removed) each completed their journey from the tool's output alone — the collecting one applied the correct fix over the paying-but-wrong one. Relay check 15/15; demo transcript re-recorded (`bt17-transcript.txt`), same 11 steps with shorter steps 4/5/8/11; stranger-text labels and the owner block byte-preserved.
- `--json` and the silent-ignore flag bugs (`status --help`, `--repo=`) were deliberately out of scope per the dispatch revision — the former waits on the owner's call, the latter is BT12's bar.
- `report.test.ts`'s verdict-word timeout was raised to the suite's 120 s heavy margin — a stopgap; the cheaper-fix preference stays in BACKLOG.md.
- K20 earlier this run delivered `kitchen/reviews/K20-conventions.md` and repaired the `gh-standin.cjs` regression that had turned hosted `test:kitchen` red after BT16.
- No real bounty, payment or solver-code execution; scratch swept (including accumulating `box-k6-stats-*.jsonl`).

## Next

This run's last wave is **K21** — the component-by-component architecture review, which reads BT16's selection model, K20's report and BT17's output changes as final. Then the run stops and reports. No wave is in flight.
