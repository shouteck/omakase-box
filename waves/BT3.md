# BT3: return — an answer comes back, is verified against the version it was made for, and lands on current code

Milestone: BT · Station: packaging · Base: `73c6c0b` · Branch: `wave/BT3` · Timebox: 60 minutes; at expiry, report partial findings and stop

## Outcome

A solver hands back the bounty folder with an edited `repo/`, and `box bounty answer` does the whole return: binds it to this bounty, extracts the change against the recorded hashes, proves it against the snapshot it was made for, brings it forward onto the repository as it stands today — or rejects it with a stated reason. The record ends `applied`, `rejected` or honestly conflicted, and says what job is waiting on the bounty.

## Scope

- Write: `packages/box-bounty/**` (answer/diff/apply module(s) + `record.ts` stage text), `packages/box-cli/src/cli.ts`, `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: `waves/BT1.md`/`waves/BT2.md` Results, `packages/box-bounty/{record,snapshot,git,manifest,create}.ts`, `tests/box/bounty/support.ts` (the snapshot-recreation recipe), `packages/box-package/verify.ts` (failure-class naming to model), `docs/box-v4/delegation/SUBMISSION-CONTRACT.md`.
- Do not touch: `.github/workflows/**`, `packages/box-package`, `box-trace`, other packages; existing tests' expected outcomes; the editable-overlay artifact format (that is the older Box's, not the bounty's).

## Done when

- `node scripts/verify.mjs test:box-bounty` exits 0 on the final commit.
- **The answer is the folder back.** `box bounty answer <id> --from <dir>` takes a returned bounty folder (`bounty.json` + `repo/`). Binding: the answer's `bounty.json` must name this id and this `snapshot.commit` — anything else is a named refusal, as is an answer on a bounty that is not `posted`. The change is extracted by comparing `repo/` against the manifest's recorded per-file sha256: changed, added and deleted paths — no diff text, no git inside the answer. A returned tree that changes nothing is `answer-empty`, never a pass.
- **Verified against the version it was made for.** For a `mechanical` bounty the snapshot is recreated in a clean directory from `refs/box-bounty/<id>` (a pruned ref is `snapshot-lost`, a named refusal — not a crash), the change applied, and the declared setup+check run exactly as `create` ran them (reuse `runDeclaredCheck`). Pass → `verified`; fail → `rejected` with the check's exit and output tail recorded as the reason. For `reviewed` there is no check to run: the answer lands at `answered` and the next step names `box bounty apply <id>` / `box bounty reject <id> --reason` — nothing claims a verification that did not happen.
- **Brought forward, never raw-written.** Applying uses git's own three-way machinery: an answer commit on top of `snapshot.commit` (the temporary-index pattern already used by the snapshot), merged into the live repository with a commit that names the bounty. A conflict aborts the merge — the worktree and index come back byte-identical — and the record stays `verified` with the conflicting paths named as the next step. Applying on top of uncommitted local changes that git would overwrite is a named refusal, not damage. Raw file writes into the worktree are not an implementation of this line.
- **Every transition is recorded and reversible.** `verified` applies automatically inside `answer` (mechanical); `box bounty apply <id>` covers `answered` and retry-after-conflict; `box bounty reject <id> --reason <text>` ends `answered`/`verified`/`posted` with the reason kept. Every ended stage (`applied`, `rejected`, `withdrawn`) removes the durability ref. An `ended` bounty refuses further transitions by name.
- **The job waiting on it is said.** `create` accepts an optional `--job <file>` whose text lives only in the record (owner context — never in `bounty.json`, the listing or the shipped folder). After `applied`/`rejected`, the output and `status` name the job it came from — falling back to the title when none was given. `status` next-step text for `taken`/`answered`/`verified`/`applied`/`rejected` is real, no longer "arrives in BT3".
- **Must-fail cases are tested:** an answer naming another id or a different snapshot commit refused by name; a do-nothing return `answer-empty`; a mechanical answer that breaks the check → `rejected` with the tail; a conflict abort leaves the repo byte-identical; `apply`/`reject`/`answer` on an ended or wrong-stage bounty → named refusals; ref gone after apply/reject.
- BOUNTY.md documents the answer contract (what the solver hands back), the three commands, and that applying writes a merge commit on the owner's branch.

## Review lenses

- [x] **Security:** foreign bytes land in the real repository here — the binding (id + snapshot commit) and the boundary (git merge only, no file writes; refusal on dirty worktree) are the checks. The reviewer attacks with wrong-id/doctored manifests, an answer whose `repo/` contains `.git` or `.box` or stray files, and by trying to apply on a dirty tree.
- [x] **User experience:** the agent-facing surface again — `answer`'s output must say verified/rejected/applied and what happens next, in words a fresh agent can act on. The reviewer runs the whole journey cold on a scratch repo.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Reuse: `runDeclaredCheck`/`CheckRecord` (create.ts already does), `git.ts` (`git`, `gitOutcome`, `gitBlob`), the `GIT_INDEX_FILE` + `checkout-index`/`read-tree` recreation recipe in `tests/box/bounty/support.ts`, `BountyRefused` named refusals and the exit-code split.
- Model rejection reasons on `verify.ts`'s failure classes (preparation-defect / environment-failure / implementation-failure) — a check that cannot run is not the same state as a check that ran and failed.
- `taken` happens implicitly: `answer` arriving on a `posted` bounty appends it before `answered` — the events must tell the true story.
- Keep the merge machinery honest: build the answer commit with `commit-tree` on a temporary index seeded from `snapshot.commit` plus the extracted change — the same trick the snapshot uses, never the real index.

---

## Result

Round 1 (`f398f92`): FAIL — `.boxignore` bypass, verify ran on never-ship file set, autocrlf apply broken, ignored-file clobber.
Round 2 (`4c30fce`): FAIL — three holes closed; `restoreBytes` crashed `EISDIR` on untracked `.box/` in the conflict path.
Round 3 (`d71f6d8`): **PASS** — below.

- Worker: box-cook (round 3) · Reviewer: the pass (fresh agent; host: Windows, Git Bash on Devin; model: Devin agent — not independently verified beyond that)
- Commit: `d71f6d8` (reviewed `1998cdb...d71f6d8` fix delta on top of `4c30fce`)
- Verify: `verify d71f6d8 PASS check=reused@2026-10-10T06-44-17-353Z-d71f6d8 build=reused@2026-10-10T06-44-17-353Z-d71f6d8 test:box-bounty=reused@2026-10-10T06-44-17-353Z-d71f6d8 db=embedded 6s` — my own foreground invocation exited 0 at run `2026-10-10T06-49-05-321Z-d71f6d8`, all steps reused recorded PASSes on this exact SHA
- Verdict: **PASS** · Level: ui-verified (rebuilt `dist/cli.js`, re-drove the defect and the new `recursive` restore surface live on scratch repos under both `core.autocrlf` settings)
- Lenses:
  - **Security:** boundary holds end-to-end — owner `.boxignore` refused (`answer-never-ship`/`owner-list`), manifest sha binds the answer, shipped-set verify sha-checks each blob (`snapshot-corrupt`), merge is the only way foreign bytes land, and every pre-merge overwrite risk is a named refusal: porcelain-dirty touched paths, ignored-but-present files (`PRECIOUS` bytes intact), and a pre-existing **directory** at a delta path (`sub/keep.txt` refused-by-name, not deleted). The new `rmSync {force, recursive}` restore cannot be tricked into deleting pre-merge content — directories are now skipped at save time and anything at a touched path that is not a tracked file is refused before the merge runs.
  - **User experience:** cold journey through `dist/cli.js` names state, next step and waiting job at every point. The conflict output names the paths, says the worktree is untouched, and names the retry — `record.conflicts` persists and `status` for `verified` names them; `answered`+conflicts shows the generic person-review next step instead (the paths are still recorded and printed on retry — minor wording gap, not a block).
- Method: diffed `1998cdb...d71f6d8` (in scope: `answer.ts` + `answer.test.ts` only — `snapshotBytes` now skips non-files, `restoreBytes` `rmSync` gained `recursive`, plus a new untracked-`.box/` conflict regression test that would have caught round 2's crash); ran `node scripts/verify.mjs test:box-bounty` myself (exit 0, reused recorded PASSes on this SHA); rebuilt `dist/cli.js`; re-probed on fresh scratch repos under `%TEMP%\bt3r-*`.
- Findings and limits:
  - **Round-2 defect closed (proved):** conflict on autocrlf=false with `.box/`+`TASK.md` untracked — `conflict` outcome printed, HEAD/index/worktree byte-identical (the record file itself legitimately rewrites), `.box/` intact, `record.conflicts={paths:[app.py]}` persisted, retry re-conflicts, resolve→`apply` lands `applied`. Same on autocrlf=true: CRLF bytes (`moved on\r\n`) preserved through the abort — `snapshotBytes`/`restoreBytes` does the byte-identity the removed pin couldn't.
  - **Recursive-restore probes (proved safe):** pre-existing dir at a delta path → `apply-worktree-dirty` naming it, contents intact; untracked file at a touched path → refused; ignored file → refused; `.box/` itself → skipped at save time, never deleted. `saved`/`restored` paths come from git-reported names (delta `-z` diff + porcelain `-z`) — repo-relative leaves, no traversal.
  - Still standing (non-blocking, as before): stray junk in `repo/` lands as `added` (spec-conformant — the solver's folder is the answer); pre-BT3 records bind the manifest only on id+commit; `taken` crash-leftover refuses `not-posted`, recoverable via `reject`; a rejected mechanical answer exits 0 (verdict, not refusal); `answered`+conflicts `status` next-step doesn't echo the recorded conflict paths (noted above).
  - New regression test is real: it commits only the conflicting file, leaves `.box/`/`TASK.md` untracked (the default state), and asserts conflict outcome, recorded paths, `status` naming, re-conflict and resolve→applied — it would have failed on `4c30fce`'s crash. Scope held: nothing outside `packages/box-bounty/answer.ts` and the test file moved.
- Merged: `8c7d4e9` into master and pushed; `wave/BT3` deleted locally (two fix rounds: verdicts `bee3b62`, `1998cdb`, `51aef38`). Resources removed: scratch repos under `%TEMP%\bt3r-*` removed; no product code edited, no tests added or weakened.
- Reflect: three rounds to get the merge boundary right, and the final shape is honest — the boundary is checked before the merge under the repo's own config, and byte-identity on abort is guaranteed by saved bytes rather than by pinning filters. The remaining wording gaps are cosmetic; the journey does what the brief says at every stage I could drive it through.
