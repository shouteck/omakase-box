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

- Worker: cook (Claude Opus 5.5, fresh agent) · Reviewer: the pass (Claude Opus 5.5, fresh agent, Claude Code on this Windows host)
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
- Verdict: **FAIL** on `ae99ff8` · Level: test-verified (the Node 22.13 fix works; the brief's outcome "the same results for the same query" does not hold, see finding 1)
- Pass notes:
  - Verify (my run, Node v24.11.0, clean tip `7fdae2b`): `verify 7fdae2b PASS check=reused@…-ae99ff8 build=reused@…-ae99ff8 test:box-bounty=reused@…-ae99ff8 test:box-package=reused@…-ae99ff8 test:kitchen=0 db=none 75s`. The reused logs (`.kitchen/runs/2026-10-17T14-18-19-547Z-ae99ff8`): box-bounty 58 files / 672 tests passed; box-package 17 passed + 1 skipped / 142 passed + 6 skipped; kitchen 12 / 83 passed (and 83 passed again in my run).
  - Node 22.13.0 (scratch, `node --version` = v22.13.0): `bt12-install.test.ts` + `bt12-package.test.ts`: 2 files, 12 tests passed. `bt31-ci.test.ts` + `bt31.test.ts` + `bt28.test.ts`: 3 files, 32 passed, 2 skipped (the two FTS5-capability tests in bt31-ci). The `ExperimentalWarning` lines in that run come from the test file's own `node:sqlite` probe, not the product.
  - Measurement-fairness lens (ticked): **fails.** Built package (`workspace.mjs build` + `pack.mjs` on Node 24), scratch repo with two records, task "fix the parser" and task "fix the subparser". `box bounty find parser` on Node 24 (FTS5): **1 match** (only "fix the parser"). On Node 22.13 (plain path): **2 matches**. Cause: `store.ts:142` `FTS_DDL` uses FTS5's default unicode61 tokenizer, not trigram, so a whole-token hit (rows non-empty) skips the `likeScan` fallback (`store.ts:826`) and drops records where the word is only a substring; `find.ts:46` then filters by substring, so the FTS path is the one that is wrong against find's own contract ("case-insensitive substring", `find.ts:4`). This is a BT31 defect the wave did not create, but the wave's outcome requires equal results, the plainSearch comment (`store.ts:843-848`) says "find answers the same on both paths", and the new BOUNTY.md line (`docs/box-v4/BOUNTY.md:893-894`) states "with the same results" — a fact that is false today. Its tests miss it because no seeded record holds a query word mid-word.
  - Otherwise both paths matched exactly on my scratch repos across 15 queries (a word in why, task, title, part-of, resume note; two words in one field; two words across fields (0 on both, find matches the whole needle); no match; `gu` (<3 letters); `PARSER`; `100%`, `a_b`, `it's`, `say "hi"`): store A created on 24 gave identical JSON on 24 and 22; store B created on 22 gave identical results on 22, on 24, and to A.
  - FTS5 detection per open: `store.ts:133-140` (query failure reads as no), called once in `setUp`, kept on the entry (`fts`). Every `records_fts` access is guarded: `ensureFts` only when `fts` (`setUp` end), delete `store.ts:417`, upsert `store.ts:446-450`, search `store.ts:795` returns before the FTS branch. Fallback `store.ts:849-854`: words and limit are bound parameters; the SQL holds only placeholders. Fields: `searchFields`/`searchText` (`store.ts:148-156`) = id + the FTS columns. Every word ANDed. The 20 bound is `FIND_RESULT_LIMIT` in `renderFind`, applied the same on both paths; find never passes `limit`.
  - Schema 1→2 (`store.ts:175-215`): `BEGIN IMMEDIATE` with the version checked again inside; ADD COLUMN plus backfill only when the column is missing. A v1 store (made on 24, `search_text` dropped, `user_version=1`, `records_fts` kept) opened first on 22.13: migrated, `status` ok, find results equal to A; then on 24: equal. The same v1 store opened first on 24: `user_version` 2, 0 empty `search_text`, equal. Reopened 3x on each Node in turn: no error.
  - Moving a store between Nodes: a 22.13 write into a 24 store, then `find` on 24, found the new record (the `fts_stale` rebuild). A store created on 22 then opened on 24 got `records_fts` with 4 rows, `user_version` 2, no stale marker. A 24 write into that store, then `find` on 22: found. The cook's stated limit (an FTS5 connection that is already open does not see `fts_stale`) only matters within a single long-lived process. Acceptable.
  - Admitted departures: (a) the fallback scans a column and uses no index. Acceptable: no index can serve a substring search, K27's sql.js "indexed LIKE" was also a scan, and I measured `instr` over ~1 KB rows on 22.13 at 1.8 ms / 25 ms / 243 ms for 1k / 10k / 100k rows, against K27's json-indexed find at 3.5–5.0 ms (10k) and 86–330 ms (100k). This cost applies only on a Node without FTS5. (b) No `status --full` search line: the brief made it optional. Acceptable. (c) Ordering: open-first / most-recent ordering is done in `find.ts` on both paths, and plainSearch returns rowid order. Equivalent for every caller (only `find.ts:43`, no limit). Acceptable.
  - Tests: `git diff fba66e5 ae99ff8 -- tests/` only adds `bt31-ci.test.ts`. No expectation changed. The Node floor is untouched (no json or `.node-version` change). The new tests would fail if the code did nothing: `hasFtsTable(plain)` must be false, and `found(plain,'parser')` must have length 2.
  - What it takes to pass: make the FTS5 path keep substring semantics. Suggestion: `tokenize='trigram'` in `FTS_DDL` (it exists in Node 24's SQLite 3.50.4; I checked that `"parser"` matches "subparser"). Because `CREATE … IF NOT EXISTS` keeps an old table, `records_fts` must be dropped and rebuilt for existing stores, for example with a schema step that sets `fts_stale` and an `ensureFts` that drops the table before recreating it. Add a bt31-ci case with a mid-word record that must give equal `find` results on both paths. If the head chef rules the FTS fix out of scope, the BOUNTY.md line and the plainSearch comment must at least stop claiming equal results, and the BT31 defect should be logged.
  - Scratch created by the pass (copied `box.js`, repos A–E, script) has been removed. The `dist` / `dist-package` rebuild left the tree clean.
- Correction round 2 (cook, Claude Opus 5.5, fresh agent; head chef's decision: remove FTS5 entirely, the plain `search_text` search is the only one). Commits `d7d2531` (code, tests, docs) + `ee36757` (store comment states the measured cost).
  1. Repro first, on Node 24 against `ae99ff8`'s store.ts: the new case "find parser returns a record with "parser" and one with "subparser"" failed with `expected [ 'whole drafted task' ] to deeply equal [ 'whole drafted task', …(1) ]` (the pass's finding). The same new file failed 4 of 4 runnable cases on the old store.
  2. `packages/box-bounty/store.ts`: FTS5 detection, `FTS_DDL`, `ensureFts`, `markFtsStale`, every `records_fts` write and the `BOX_BOUNTY_TEST_NO_FTS5` switch removed. `searchText` (`:130`) builds the lower-cased column (id, title, why, part-of/job file, task, content note, resume note); `upsertRow` (`:394`) writes it in the record's own transaction; `deleteRow` (`:388`) deletes the row only. `searchRecords` (`:735-753`) is the only search: every word ANDed as `instr(search_text, ?) > 0`, bound parameters only, rowid order, optional `LIMIT ?`; `find` re-checks the exact needle per field and applies the open-first order and the 20 bound as before. The old short-needle `likeScan` over JSON is gone (find's per-field filter made its extra hits invisible).
  3. Schema 3 (`store.ts:149-231`): one `BEGIN IMMEDIATE` migration, version re-checked inside. Adds `search_text` if missing, rebuilds it for every row from the row's JSON, `dropFts` (`:160`) drops `records_fts` — a plain `DROP TABLE` where FTS5 exists (SQLite removes the five shadow tables), otherwise the shadow tables are dropped and the virtual table's schema row deleted under `writable_schema` (a build that refuses both keeps an inert table nothing reads; savepoint-guarded) — deletes the `fts_stale` meta row, sets `user_version=3`. Every step is safe to repeat; a crash leaves the old version and the next open reruns it.
  4. False claims corrected: the old `plainSearch` comment is replaced by the `searchRecords` comment (`store.ts:735-744`: one search, substring, same on every Node, a scan with its measured cost); the store header (`:5-6`); `find.ts:37-41` (said "FTS5 for a needle of three letters or more"); `docs/box-v4/BOUNTY.md:893-894` now reads "`find` is one plain case-insensitive substring search over a lower-cased text column, the same on every Node; SQLite's FTS5 is not used."
  5. Tests: `tests/box/bounty/bt31-ci.test.ts` rewritten to the single path. Five cases, all run on Node 22.13 and four on Node 24: create/status/find answers + no `records_fts*` + version 3; the pass's parser/subparser case (`find parser` returns both, also `PARSER`); a version-1 store and a version-2 store (on an FTS5 Node holding a real `records_fts`, filled, plus a `fts_stale` row) open, migrate, drop every `records_fts*` table, clear the marker, leave no empty `search_text`, pass `integrity_check`, and find by substring before and after a new write; and, skipped where SQLite has FTS5 (it needs `DROP` to fail), a store whose schema holds `records_fts` + shadow tables migrates through the `writable_schema` path. Other tests mentioning FTS: `tests/box/bounty/bt31.test.ts:129` was titled "find matches words in why and task through FTS5"; its assertions (`matched: why`, `matched: title, task`) hold unchanged under substring search, only the title now says "through the store search". No other test asserted FTS behaviour and no test pinned whole-word matching (the `fts` grep hits in bt15, bt23-review and e2e journey are the word "drafts").
  6. Real cross-Node store, by hand (scratch, tsx, the package source): a store written by `ae99ff8`'s code on Node 24 (version 2, `records_fts` + 5 shadow tables) gave `find parser` = `["whole"]` (the bug); opened by the new code on Node 22.13: `["whole","inner"]`, no `records_fts*`, version 3, integrity ok; then on Node 24: the same. A store created on 22.13 by the new code, then read on 24: `["whole","inner"]`.
  7. Node 22.13.0 (scratch, `node --version` = v22.13.0), on `ee36757`, `node scripts/suite.mjs box --suite bounty tests/box/bounty/bt12-install.test.ts tests/box/bounty/bt12-package.test.ts tests/box/bounty/bt31-ci.test.ts tests/box/bounty/bt31.test.ts tests/box/bounty/bt28.test.ts` (warning lines omitted):
     ```
     scoped run: 5 file(s) under tests\box\bounty — this is an inner loop, never suite acceptance
      RUN  v5.0.1 C:/Users/shout/Desktop/Projects/private-task-mvp
      Test Files  5 passed (5)
           Tests  47 passed (47)
     ```
  8. Verify (Node v24.11.0, clean tree, foreground run logged to a temp file): `verify d7d2531 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 test:kitchen=0 db=none 802s`; after the comment-only commit, second and last full run: `verify ee36757 PASS check=0 build=0 test:box-bounty=0 test:box-package=0 test:kitchen=0 db=none 820s` (box-bounty 58 files, 672 passed + 1 skipped, the skipped one being the no-FTS5-only case; box-package 142 passed + 6 skipped; kitchen 83 passed).
  9. Find cost, a deliberate trade. BT31's Done-when promised K27's benchmark within twice K27's numbers; the FTS5 find was ~1 ms at 100,000 records. The head chef chose correctness and one path over that speed (identical results on every Node by construction, the substring rule find already promised, no cross-Node `fts_stale` machinery). `kitchen/memory/storage/benchmark.mjs --engine box-store --n 10000` (tsx, Node 24): `find 0.21 ms (20)`, but its op passes `LIMIT 20` with a query that every record matches, so the scan stops after 20 rows and the number says nothing about the scan. Its JSON also prints `"fts5": true` from its own default (`store.fts5 ?? true`) — stale kitchen tooling, not product; not changed here (outside the write paths). Measured directly (scratch script, the benchmark's record shape, ~1 KB search text and ~2 KB JSON per row, median of 5, no limit as `find` calls it): Node 24 — no-match query 38.9 ms at 10,000 and 382.6 ms at 100,000; `findBounties("part 777")` 41.7 ms / 401.8 ms. Node 22.13 at 10,000: 38.6 ms / 42.0 ms. **That is slower than the pass's 25 / 243 ms, and at 100,000 it is above K27's JSON-indexed find (86–330 ms), so the brief's "faster than K27's JSON baseline" holds at 10,000, not at 100,000.** Cause found: `search_text` is the last column, after `json`, so every scan walks each row's JSON overflow pages. In raw SQL at 100,000 rows the same scan over a separate two-column table took 147 ms against 393 ms in the same row. Not done (a layout change the decision did not ask for); proposed as a follow-up.
  - Principles that changed a decision: subtract-before-you-add (deleted the FTS paths, the `likeScan` short-needle path and the test switch instead of keeping them as fallbacks); make-operations-idempotent (one migration that converges from version 1 or 2, rebuilds `search_text` for every row, drops whatever FTS objects exist, and reruns safely after a crash). Playbook: bug fix (repro on the old code first, then the fix, verified on the same surface on both Nodes).
  - Not done: the separate search table above; the benchmark's own `fts5` field and LIMIT-20 find op. Scratch files are outside the repository (session scratch) and the cross-Node repos and databases have been removed.
- Merged: · Resources removed:
- Reflect:
