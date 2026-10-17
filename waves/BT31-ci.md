# BT31-ci: the record store works on Node builds without full-text search

Milestone: BT · Station: packaging · Base: master `995f5ba` · Branch: `wave/BT31-ci` · Timebox: 75 minutes; at expiry the cook stops and reports where it is

**Brief.** Written by the CTO on 17 October 2026. The hosted run after BT31 closed (run 39038565176, commit `995f5ba`) is red: the `verify` job passed, the **`install-node22`** job failed (`bt12-install.test.ts` "runs the whole $0 bounty journey", `bt12-package.test.ts` "names no command spelling but `box bounty …`"). A red master comes before any other wave. Detailed for a cook without deep reasoning.

## What failed, reproduced

The CTO reproduced it on this Windows host with the official Node 22.13.0 (from nodejs.org, SHA-256 checked, unpacked in scratch at `C:\Users\shout\AppData\Local\Temp\claude\C--Users-shout-Desktop-Projects-private-task-mvp\7783bdcb-e009-499b-8c7d-0849254bd9ae\scratchpad\node22\node-v22.13.0-win-x64\node.exe`; use it, do not download another):

```
box bounty create --task TASK.md --why "beyond this agent"
bounty create failed: no such module: fts5
exit=1
```

**Cause:** BT31's store (`packages/box-bounty/store.ts`) creates an FTS5 virtual table (`records_fts`). The SQLite inside Node 22.13.0 is compiled **without FTS5**; Node 24.11 (this host's, where BT31 was built and reviewed) has it. Whether a given Node build includes FTS5 depends on how it was compiled (some Linux distributions build Node against their own SQLite), so raising the Node floor would not be a reliable fix.

## Outcome

The tool works on every supported Node, with or without FTS5: it uses FTS5 for `find` when the running SQLite has it, and an indexed text search when it does not, with the same results for the same query.

## Scope

- Write: `packages/box-bounty/store.ts` (and `find.ts` only if it calls the store's search directly), `tests/box/bounty/**` (a new test), `docs/box-v4/BOUNTY.md` (one line).
- Do not touch: the Node floor (22.13.0 stays); any other behaviour; any test expectation.

## The fix

1. **Detect once per database open:** after opening, run `SELECT sqlite_compileoption_used('ENABLE_FTS5') AS fts5` (read the value; if the query itself fails, treat it as no). Keep the answer for the connection.
2. **With FTS5:** exactly today's behaviour.
3. **Without FTS5:** do not create `records_fts`; `search(query, limit)` runs the fallback K27 measured for `sql.js` (`kitchen/reviews/K27-storage.md`, "find fell back to indexed LIKE"): match each query word, case-insensitively, against the same fields FTS indexes (`id, title, why, part_of, task, note`), every word must match, same ordering rule as the FTS path (open first, then most recent), same 20-result bound. Store the searchable text in a plain column (for example `search_text`, lower-cased, kept in step in the same transaction as the record) so the fallback does not parse JSON per row.
4. **A database created on one Node and opened on another:** if the file has `records_fts` but the running SQLite lacks FTS5, the store must still open and work (fall back for search; never try to write to `records_fts`). If the file lacks `records_fts` and the running SQLite has FTS5, create and fill it then. Test both.
5. **Never fail silently, never fail on this:** no message is printed about FTS5 in normal output; `status --full` may state `search: full-text` or `search: plain` as one fact line, if the output budget test (`bt17.test.ts`) allows it; otherwise leave it out and say so.

## Tests (`tests/box/bounty/bt31-ci.test.ts`)

- Force the no-FTS5 path in-process (an environment variable read only by tests, for example `BOX_BOUNTY_TEST_NO_FTS5=1`, documented as test-only in a comment) and run: `create`, `status`, `find` on a word in `why`, on a word in the task, on two words (both must match), and on a word in nothing; results equal to the FTS5 path's for the same records.
- A store created with FTS5, then opened with the variable set: works; `find` answers.
- A store created without FTS5, then opened normally: `records_fts` is built and `find` answers.
- **Run the two hosted-failing files under the scratch Node 22.13.0 on this host** (`export PATH="/c/Users/shout/AppData/Local/Temp/claude/C--Users-shout-Desktop-Projects-private-task-mvp/7783bdcb-e009-499b-8c7d-0849254bd9ae/scratchpad/node22/node-v22.13.0-win-x64:$PATH"` in Git Bash, then `node --version` must print v22.13.0, then `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt12-install.test.ts tests/box/bounty/bt12-package.test.ts`): both green. Paste the output into the Result.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package test:kitchen` exits 0 on the final commit (on this host's Node 24).
- The two bt12 files pass under Node 22.13.0 on this host (above).
- After the merge push, both hosted jobs are green; the head chef reads them before closing.

## Review lenses

- [ ] **Security:** not applicable beyond the fallback using bound parameters only (no query text concatenated into SQL).
- [ ] **User experience:** not applicable.
- [x] **Measurement fairness:** the pass reruns the two bt12 files under Node 22.13.0 itself and compares `find` results on both paths.

## Notes for the worker

- Bug-fix playbook: the failure is reproduced above; reproduce it yourself first with the scratch Node, then fix.
- Do not edit `waves/BT31-ci.md` while a verify runs.
- Report at the timebox. Do not run on.

---

## Result

- Worker: cook (Claude Opus 5.5, fresh agent) · Reviewer:
- Commit: `ae99ff8` (code, test, BOUNTY.md line)
- Verify: `verify ae99ff8 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 test:kitchen=0 db=none 832s` (Node 24.11.0, one full run)
- Node 22.13.0 run of the two bt12 files: reproduced first on `fba66e5` (`bt12-install` "runs the whole $0 bounty journey" failed with `bounty create failed: no such module: fts5`; `bt12-package` passed on this host, 1 failed | 11 passed). After the fix, scratch Node `v22.13.0`, `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt12-install.test.ts tests/box/bounty/bt12-package.test.ts`:
  ```
  scoped run: 2 file(s) under tests\box\bounty — this is an inner loop, never suite acceptance
   RUN  v5.0.1 C:/Users/shout/Desktop/Projects/private-task-mvp
   Test Files  2 passed (2)
        Tests  12 passed (12)
  ```
  Also under Node 22.13.0: `bt31.test.ts` and `bt28.test.ts` green; `bt31-ci.test.ts` 2 passed, 2 skipped (the two tests that open a store *with* FTS5 skip by a capability probe where SQLite lacks it). Cross-Node CLI by hand: create on 24, `find` on 22, create on 22, `find` on 24 — each found its record.
- Fix: FTS5 detected per open (`sqlite_compileoption_used('ENABLE_FTS5')`, test-only `BOX_BOUNTY_TEST_NO_FTS5=1`). Every row keeps a lower-cased `search_text` (id + the FTS fields); without FTS5 `records_fts` is never touched and `searchRecords` ANDs each word with `instr(search_text, ?)`, bound parameters, rowid order (FTS's order; `find` does the open-first ordering and the bound). Schema `user_version` 1 → 2 adds and backfills the column. A no-FTS5 write sets meta `fts_stale`; an FTS5 open with `records_fts` missing or stale rebuilds it in one transaction. Not done: the search is a column scan, not an index (no index can serve a substring); no `status --full` search line (optional; left out to keep the change small). An FTS5 connection already open does not see `fts_stale` until it reopens.
- Verdict: · Level:
- Merged: · Resources removed:
- Reflect:
