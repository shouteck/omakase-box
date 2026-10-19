# kitchen/memory/scale — K39 scale targets

`measure.mjs` measures the four PLAN.md scale targets that had never been
measured, against the **built** CLI and the same GitHub stand-in the bounty
suite pins (`tests/box/bounty/github-fixture.ts` — the script and its
NODE_OPTIONS preload are extracted from that file verbatim at run time).

## Run

```
node scripts/workspace.mjs build
node kitchen/memory/scale/measure.mjs                 # all four targets
node kitchen/memory/scale/measure.mjs --target=3      # one target, for a quick rerun
node kitchen/memory/scale/measure.mjs --target=1,2    # a subset
```

The CLI measured is `packages/box-cli/dist/cli.js` (the built entrypoint —
there is no `dist/box.js`).

## What it measures

| Target | Point | Runs |
|---|---|---|
| 1 | `create` at 1,000 / 10,000 / 100,000 tracked files (goal: < 1 s at 10k) | 5 each |
| 2 | `post --with-changes` at 0 / 5 / 50 unpushed commits (goal: < 30 s), plus isolated `git push` and `post --preview` legs for the breakdown | 5 each |
| 3 | `status` (first discovery vs steady state), `status --full`, `status --json`, `look <id> 1`, `look <id> 100` with 100 PRs on one bounty | 5 each |
| 4 | `apply` and `close` with 10 vs 1,000 records in the store | 5 each |

Each cell reports all five wall times (process start to exit), median,
min–max range, and a host-load snapshot (`scripts/host-load.mjs`
`captureLoad` plus a ~250 ms CPU-busy sample — `os.loadavg()` is a stub on
Windows and is never reported as observed load). Generator counts are
verified and printed: `git ls-files`, files on disk, PR count, `refs/pull/*`
count, seeded record count.

## Fixture facts worth knowing

- Scratch everything lives under one `%TEMP%\kitchen-k39-*` root, removed in
  a `finally` (10 retries). Settings are `BOX_BOUNTY_SETTINGS_DIR` in
  scratch — the owner's settings are never read.
- Every git repository pins `gc.auto=0` and `maintenance.auto=false`
  (K38 rule).
- `create` snapshots the worktree through a temp `GIT_INDEX_FILE` + `add -A`
  (`packages/box-bounty/snapshot.ts`), so the file counts are real files on
  disk — the 100k point materializes 100,000 NTFS files (batched async
  writes) and `git add`+`commit` them; setup cost is reported beside the
  measured runs.
- Solver PRs are real commits (`git commit-tree`, parent = the bounty branch
  tip) pushed in one batched push to `refs/pull/<n>/head`, with stand-in
  `prs` entries — the `prCommit` pattern from the fixture.
- Target 4 seeds records as `.box/bounties/*.json` compat files (K25's
  generator shape) and lets the tool's own import persist them into
  `.box/local/box.db`.
