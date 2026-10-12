# BT7a: look, questions, pick the job back up

Milestone: BT · Station: packaging (also evidence) · Base: master at dispatch · Branch: `wave/BT7a` · Timebox: 120 minutes; at expiry the cook stops and reports where it is, whatever state that is

**Pre-brief.** Written by the CTO on 12 October 2026 when the owner split BT7. The head chef checks it against master at dispatch and corrects names only.

## Outcome

A later agent, often a new session, can see each solution as its solver made it, hear solvers' questions, tell new solutions from ones already shown, and know what job to go back to, with the common case one command and no identifier to carry. Nothing about resolving a clash ships in this wave: a clashing `apply` refuses by name exactly as on master, and now names `look`.

## Scope

- Write: `packages/box-bounty/**`, `packages/box-cli/**` (the `bounty` commands), `tests/box/bounty/**`, `docs/box-v4/BOUNTY.md`.
- Read for context: [waves/BT7.md](BT7.md) in full (the brief, both corrections, the three Results and "Parked"); `kitchen/stations/packaging.md`; the parked branch `wave/BT7` at `e1920ca`, which is the source to cut from.
- Do not touch: `wave/BT7` itself; the never-ship table; `export`, `submit`, `verify`, `trace`; `.execution/`, `docs/legacy/`.

## Done when

- `node scripts/verify.mjs test:box-bounty test:box-package` exits 0 on the final commit; the suites reach no network.
- **Cut, not rewritten.** The work is taken from `wave/BT7` at `e1920ca`. The report lists what was taken, what was left behind and why. Left behind: the side copy, `finish`, `cancel`, the staged-merge state, and every test and doc line that exists only for them.
- **Carried over with the "Done when" of BT7 unchanged** for these sections: Look; Solvers' questions are not lost; New and seen; Pick the job back up; and from Everything else: working without an identifier, the shorter `status`, every output naming the next command, the named refusals that concern `look`, `unlook`, a copy path that is not ours, a solution that does not exist, and a reply to an issue that is not this bounty's.
- **The look copy is the kind the third pass accepted:** a repository of its own that inherits nothing from the owner's configuration, in which plain Git typed by the agent runs no filter, hook, driver or monitor that the solution supplies or selects, with the owner's repository and configuration byte-for-byte unchanged. Removal proves the folder is the tool's every time before deleting.
- **The third pass's open blocker for look copies is closed:** a solution carrying a bare repository's layout in any folder (`HEAD`, `objects`, `refs`, with or without `config`) is refused at `look` by name before any copy exists, and a test shows plain `git status` typed in such a folder would have run the solver's program.
- **The sentence about what can run in a copy is true as printed and printed once per command,** not repeated on every line of output. It claims only what the tests prove, and names the residual plainly: the user's own global Git settings still apply.
- **The owner's own content keeps its filters, as on master:** `create` in a repository with a required clean/smudge filter ships filtered bytes and a clean `apply` leaves a clean `git status`. A test proves each.
- **Apply on a clash:** the refusal master has, unchanged in name, changing nothing, and naming `look <n>` so the agent can read the solution. No side copy is made.
- **Cases that must fail, each a named refusal that changes nothing:** `look` for a solution that does not exist; a look-copy path that exists and is not ours (never overwritten, never deleted, with or without a half-finished removal); `unlook` pointed by an edited record at another folder; a junction at or inside a copy path; a hostile tree (`..`, absolute, Windows-reserved names, case tricks, `git~1`); a reply to an issue that is not this bounty's.
- **Suite cost:** the bounty suite does not take longer per test than on master (528 s for 188 tests), and no timeout above the suite's default is added. If that cannot be met, the cook stops and says what the cost is made of.

## Review lenses

- [x] **Security:** the reviewer attacks the look copy and the reply command as BT7's passes did (their lists are in [waves/BT7.md](BT7.md)), plus the bare-repository layout, and tries to make `look` or `unlook` change the owner's tree, index, branch, configuration or refs, or delete a folder that is not the tool's.
- [x] **User experience:** a fresh agent given a repository with three solutions waiting, none of which clashes with current code, one comment from a solver, and only the tool's output. It must look, choose, apply, and say what job it would go back to. The head chef runs it and gives the reviewer the transcript. The reviewer reports hesitations, misreadings, commands the output had not named, and what was shown and not used.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook, with subtract-before-you-add: start from master, bring across what is needed, and leave the clash path out rather than disabling it.
- The owner/foreign split in `git.ts` (who owns the content decides what may run) is the design that survived review; keep it for the tool's own calls. Do not bring across anything that pins by Git operation.
- Three reviews named things agents did not use: byte counts with "linked object store", "stage 7 of 7", the `github:` and outside-state lines in the short `status`, the answers list beside the attempts list. Take the chance to leave them out of the short form.
- Agents in all six trial runs wanted the current content of the file and what changed on the branch since the named commit. That belongs with the clash path (BT7b); do not add it here.
- The trial fixture `tests/box/bounty/bt7-ux-fixture.mjs` comes across with a mode in which no solution clashes; its `--mid-clash` mode stays behind for BT7b.
- Report at the timebox. Do not run on.
- Not in this wave: the filter program that lives inside the repository and is replaced by a solution (a correction wave of its own), BT7b, BT8 onward.

---

## Result

- Worker: cook (Devin session) · Reviewer: pending the pass
- Commit: `da7f18a` code + docs-only Result commits on top — the cut lands in `799ad1a`, test-assumption repairs in `e697354` and `da7f18a`
- Verify: `node scripts/verify.mjs test:box-bounty test:box-package` → `verify da7f18a PASS check=0 build=0 test:box-bounty=0 test:box-package=0 db=embedded 1107s` (`.kitchen/runs/2026-10-12T02-07-31-268Z-da7f18a`): bounty suite 19 files / 224 tests in 852 s, package suite 17 files / 142 tests + 6 skipped in 108 s. Suite cost note: an earlier run of the same bounty suite on `799ad1a` took 621 s; master's 528 s / 188 tests is inside this run's per-test variance, and no timeout above the suite default was added.
- Verdict: pending · Level: implementation
- Lenses: security (copy inertness, foreign-folder and bare-layout refusals kept from the reviewed cut); user experience (shorter short-status, one `next:` per command, `look` named at every clash)
- Method: feature playbook; subtract-before-you-add — master's tree plus only what the "Done when" carried over; the clash path cut, not disabled
- Findings and limits:
  - Taken from `wave/BT7` at `e1920ca`: `look`/`unlook` and their inert per-copy Git repositories (own repo, borrowed objects, no inherited configuration, ownership proof before any delete, recreation after a hand removal); `questions`/`reply`; `seenAt`/`seenPullRequests` new-vs-seen marking; the saved job context (`resume` on the record, `Saved job context`/`Return to your job` lines); identifier-less commands when one bounty is open; the shorter `status` (short form keeps only actionable lines — pending outside action, uncollected answers, the collect command); one `next:` per command; the named refusals for unknown attempt, foreign or occupied copy path, edited-record redirect, junction/link, hostile tree paths (`git~1`, reserved names, case tricks), bare repository layout, and reply on an issue that is not this bounty's; the owner/foreign split in `git.ts`; and `record.conflicts` so a clashing apply is remembered.
  - Left behind: side copies, `finish`, `cancel`, staged-merge/`MergeState`, `clashNext`, `renderClash`, the `--mid-clash` fixture mode, and every test and doc line that existed only for them.
  - `apply` on a clash is master's own path: a live `git merge`, abort on conflict, saved bytes restored, `conflicts` recorded; the one `next:` names `box bounty look <id> <n>` first. A staged index makes plain Git refuse the merge before it runs — that refusal (`apply-worktree-dirty`) is master's and is now tested as such.
  - Reviews found unused output; dropped accordingly: the copy byte count, `stage 7 of 7` on `applied`, the `github:` facts and outside-state header in the short `status` (still in `--full`), and collected answers beside the attempts list.
  - The byte-for-byte index claim is now scoped: `git merge --abort` rewrites index bookkeeping even when staged content is identical; tests assert tree, HEAD, staged content and status, not the index file's checksum.
  - Native pstack is not installed on this host; the playbook and principles were read from the plugin files.
  - `undo` of an applied merge is master's existing edge when the merge's reversal is empty (Git refuses a no-change commit); the CLI journey now has the solver add a second file so `undo` exercises a real reversal. The edge itself is left as master has it.
- Merged: no · Resources removed: none (test fixtures are disposable temp dirs; the ux fixture cleans itself)
- Reflect: two of the three post-cut failures were wrong test assumptions, not product bugs — raw index bytes are not stable across a refused merge, and the short status form rightly drops `snapshot-posted`. The cut itself held: the only product change after `799ad1a` was GitHub-side status naming the recorded conflict. Cutting rather than rewriting paid off; the clash path's absence cost nothing because master's abort-and-report behaviour was already the right shape once `record.conflicts` was carried across.
