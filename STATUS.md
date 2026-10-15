# Status

Updated by the CTO on 15 October 2026 at the K20 close.

## Now

- **K20 completed.** Reviewed commit `dd91b37`, independent PASS test-verified; merged `c31c856`. `kitchen/reviews/K20-conventions.md` measures every `box bounty` command against `git`/`gh`/`npm` with quoted runs: top departures are `--help` absent or inconsistent below top level, no machine-readable output (`--json` silently ignored), `--flag=value` unsupported/inconsistent, and no `--version`; waiting-post exit 0 and prose `config` are deliberate and stay.
- **The wave also repaired a red master.** BT16's `github-push-denied` gate broke `test:kitchen` — `kitchen/demo/gh-standin.cjs` never returned `permissions`, and no check suite reaches it, so the hosted run went red (38687637404). K20's amended scope added the one-line `permissions: { push: true }` repair; `verify dd91b37 PASS test:kitchen=0 db=none 88s`. The parity-check gap is in BACKLOG.md.
- BT16 earlier this run: fork/mirror remotes resolve through the owner's list; `repository-address-ambiguous` retired; `github-push-denied` added. Merged `d04a072`.
- Flakes seen this run: the known `report.test.ts` 30 s timeout and `bt11` promise-lock 15 s under load — both green on rerun, in BACKLOG.md.
- No real bounty, payment or solver-code execution; all scratch swept, including five leftover `box-k6-*` temp items.

## Next

This run continues with **BT17**, then **K21**, then stops and reports. BT17 shortens command output under a measured budget, drawing on the K20 report; K21 reviews the architecture last so it sees the final state. No wave is in flight.
