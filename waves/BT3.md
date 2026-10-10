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

<One or two lines per item. Detail goes in a notes file next to the evidence, linked from here.>

- Worker: · Reviewer:
- Commit:
- Verify:
- Verdict: · Level:
- Lenses:
- Method:
- Findings and limits:
- Merged: · Resources removed:
- Reflect:
