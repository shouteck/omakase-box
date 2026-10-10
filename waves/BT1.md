# BT1: create a bounty, complete and safe, on disk

Milestone: BT · Station: packaging · Base: master at the commit that adds this file · Branch: `wave/BT1` · Timebox: 120 minutes; at expiry, report partial findings and stop

## Outcome

An agent, or a person, runs one command in a repository and gets a complete bounty in a folder: a snapshot of the repository as it stands with never-ship files removed, the task, the note on what was already tried, the check that decides success, and a listing a stranger could read. Before writing anything it shows exactly what would leave. It confirms the check really fails today. **Nothing is posted and nothing leaves the machine in this wave.**

```
box bounty create --title "<one line>" --task <file> [--note <file>] \
    [--setup -- <command>] [--check -- <command>] --out <dir>
```

Read "The product in one line", "The journey of one bounty" and "What is settled" in `PLAN.md` first. This wave is step 3 of that journey.

## Scope

- Write: `packages/box-bounty/**` (new), `packages/box-cli/**` (the `bounty create` command only), `tests/box/bounty/**` (new), `docs/box-v4/BOUNTY.md` (new, one page: the command, what a bounty folder contains, the never-ship rule), and the smallest change that registers the new test suite.
- Read for context: `PLAN.md`; `kitchen/stations/packaging.md` (its traps on canonical paths, Windows paths and clean directories apply directly); `packages/box-package/commands.ts` (reuse its program launch), `packages/box-contracts` (hashing), `packages/box-package/manifest.ts` and `submit-tool.ts` (how a Box records its files today); `docs/box-v4/delegation/SUBMISSION-CONTRACT.md`.
- Do not touch: the existing `export`, `submit`, `verify` and `trace` commands and their tests; `packages/box-trace/**`; `.execution/`; `docs/legacy/`.

## Done when

- `node scripts/verify.mjs` exits 0 on the final commit, with the new suite included. Name the suite in the Result.
- **The snapshot is the repository as it stands.** Tracked files with their uncommitted changes, plus untracked files that are not ignored; no `.git`, no history. Tests build their repositories at run time in a temp folder (a fixture cannot contain a `.git`), and cover: a clean tree; uncommitted edits; an untracked new file; an ignored file (absent); a file deleted in the working tree (absent).
- **Creating it changes nothing.** The working tree, the index and the current branch are byte-for-byte as before. A test proves it.
- **The snapshot can be recreated later from the repository alone,** exactly, by an identifier the bounty records, so that a later wave can verify an answer against it after the code has moved on. Say how in the doc page. Prototype this first: it is the one open design question in the wave.
- **Never-ship holds, and is attacked.** Built in and not overridable in this wave: `.git`, `.env` and `.env.*`, `secrets/`, `.runtime/`, private keys and certificates by their usual names and extensions; plus an owner's list in a file at the repository root (name and syntax yours to choose and document). The check runs on each file's real path. Tests use made-up secret files written at run time, never anything real, and must show each of these stays out: a secret that is tracked; one that is untracked; one reached through a different letter case; one reached through a link or junction inside the repository; one in a nested folder; one matched only by the owner's list. A link that points outside the repository is refused by name, not followed.
- **The bounty says what it is.** The folder contains the snapshot, a manifest (id, title, task, note, setup and check commands, level, the snapshot identifier, every shipped file with its hash, counts and bytes, the tool version) and one human-readable listing at the top that a stranger can act on: what is wanted, how to set up, how to run the check, what counts as done. The manifest names the never-ship rules that applied and how many files each removed, and **does not name the removed files.**
- **The level is stated, and decided by rule:** with a check that fails today it is *mechanical*; with no check it is *reviewed* and the listing says a person will read the answer. (*Example* arrives when a later wave lets the owner confirm a drafted example; say so, do not build it.)
- **The check really fails today.** When a check is given, the tool runs the setup and then the check inside the finished snapshot, in a clean directory outside the checkout, as a solver would. If it passes, the tool refuses: there is nothing to solve. If it cannot run, it says which program or step. The exit code and the end of the output are recorded in the manifest.
- **A case that must fail:** a check that already passes produces the refusal above and no bounty folder. Show it in a test.
- **The preview comes first and is complete:** how many files and bytes would leave, which never-ship rules removed how many files (here, locally, the file names are shown), the task, the check and its level, and where the folder will be written. `--preview` stops there and writes nothing.
- **Every outcome is a named state with a next step.** Success ends with one line: the bounty's id, "stage 1 of 7: drafted", and what happens next. Refusals each have a name, a plain reason, and a non-zero exit that cannot be mistaken for the check's. The command never prints nothing.
- It refuses clearly outside a Git checkout. It works on this Windows host from Git Bash and PowerShell, on one Python repository and one Node repository built by the tests.

## Review lenses

- [x] **Security:** the never-ship rule keeps something in. The reviewer attacks it with its own hostile inputs beyond the listed ones and says which it tried: spellings, links, case, a secret added after the preview and before the write, a secret inside an otherwise ordinary file name, a path containing odd characters.
- [x] **User experience:** the reviewer creates a bounty in a small repository of its own without reading the code first, once as a person and once by giving only the doc page to a fresh agent and asking it to create one. It reports what was unclear, and whether a stranger handed only the folder could say what is wanted and how to know they are done.
- [ ] **Measurement fairness:** not applicable.

## Notes for the worker

- Feature playbook. Prototype the reproducible snapshot first and throw the prototype away. An identifier Git itself can resolve later, created without touching the branch, the index or the working tree, is the obvious candidate; decide by trying and say what you tried.
- A bounty folder is a Box of a new kind: the whole repository. Reuse the existing manifest fields, hashing, path handling and program launch wherever they fit. Do not force this into the per-file editable list of the older agreement; the answer format belongs to wave BT3. Record each file's hash so that wave can seal and verify an answer.
- The record that outlives the agent, the owner's yes, posting, and taking an answer back are waves BT2 and BT3. Build none of them. `--out` is just a folder.
- The stage names for the whole journey are: drafted, confirmed, posted, taken, answered, verified, applied; ended early as rejected, withdrawn or expired. This wave only ever reaches the first.
- This repository's own rule still binds you: do not read `.runtime/`, `.env*` or `secrets/` here. Your tests make their own fake ones in temp folders.
- No scanning of file contents for secrets in this wave; state that limit in the doc page.
- Everything the wave creates in the temp folder is named for the wave and removed.

---

## Result

- Worker: box-cook · Reviewer: the pass (fresh agent; host: Windows, Git Bash + PowerShell; model: Claude/Anthropic)
- Commit: `e473b07910c955c09962574af08c49240838060e` (re-review; first pass on `24a2822` returned FAIL, all blockers fixed and re-probed)
- Verify: `verify e473b07 PASS check=0 build=0 test:box-bounty=0 db=embedded 109s` — recorded run `2026-10-10T01-27-22-413Z-e473b07` (clean tree, all steps 0, 39 tests); plus my own scoped `suite.mjs box --suite bounty` earlier: green, and an 11-test scratch probe file run scoped against the new code (then removed)
- Verdict: **PASS** · Level: ui-verified (built CLI driven end-to-end again this round in Git Bash — unicode filename ships, secrets removed — plus in-process hostile probes)
- Lenses:
  - **Security:** every round-1 break re-attacked and now holds — `.boxignore` folds both ways (`SecretDir/` and `*.KEY2` remove their targets), `prod.env`/`id_rsa_backup`/`.yarnrc`/`*.cert/.p7b/.asc`/`secrets-backup/`/`mysecrets/` all removed, `--task .env` and a `--note` reached through a junction into an outside `secrets/` dir both refuse `never-ship-input`, and bytes swapped or junction-swapped after planning ship the *recorded* bytes (cat-file emission). Still shipping by design/owner-list catch-all: `.kube/config`, `credentials.json`, `wp-config.php`, `id_x25519`, `backup_id_rsa`, `.env2`, `env.local`.
  - **User experience:** unchanged in shape — still one command, complete preview, named states; doc now covers the build step, a PowerShell recreate recipe, the `--out`-outside rule and the `.git/objects` retention note. A stranger handed the folder can still say what is wanted and that `check` exiting 0 means done.
- Method: diffed `24a2822..e473b07` line by line (all claimed fixes present; nothing outside the same allowed paths slipped in); re-ran the round-1 attack set as a scoped scratch probe file plus new attacks on the new paths (secrets-substring over-block, junction-spelled `--out`, untracked-target-via-junction TOCTOU residual, clean-filter divergence, BOM in `.boxignore`); smoke-ran the built CLI on a repo with a unicode filename and fake secrets.
- Findings and limits (all non-blocking; none leaks — over-removal or narrow windows only):
  - **`secrets` substring matches basenames too:** `docs/secrets.md`, `SECRETS.md`, `docs/no-secrets-here.txt` are all removed (proved). Safe direction and preview-visible, but owner patterns can't re-include, so a legit doc named `*secrets*` is unshippable — consider limiting the substring match to directory segments.
  - **TOCTOU residual:** an *untracked* file reachable only through a junction spelling (canonical path absent from the tree) still emits live bytes — proved `SWAPPED-AFTER-PLAN` ships under `hidden/f.txt`. Narrow: needs a gitignored target reached only via link plus a mid-run mutation.
  - **`--out` junction residual:** `--out` is `resolve()`d, not realpath'd — a junction spelling outside the repo pointing inside it bypasses `out-inside-repo` and the bounty lands inside the checkout (proved).
  - **Clean filters:** `repo/` now ships blob bytes — with a configured `filter.*.clean` (proved with `tr a-z A-Z`) shipped bytes differ from the worktree; git-lfs repos would ship pointer stubs. Consistent with the recorded identifier; worth a documented limit.
  - **Doc-relevant limits:** `.boxignore` has no `[...]` classes (documented); a BOM before a pattern is fine (`trim()` eats it — probed); `ls-tree` listing call has no `maxBuffer` bump (1 MB default → loud ENOBUFS on ~20k+ file repos, no silent truncation); `.env.example`-style files stay excluded; no content scanning (documented).
  - **Fixed and verified closed:** non-ASCII names (quotepath), `.boxignore` case-fold, wider spellings, `--task`/`--note` never-ship guard incl. junction target, emit-from-tree TOCTOU, autocrlf divergence, `out-inside-repo`, dangling-link `unreadable-path`, four named-state tests, README blank line, doc build step + PowerShell recipe + retention note.
- Merged: awaiting merge decision by head chef. · Resources removed: scratch probe file deleted; all `%TEMP%\box-bt1-pass-*` dirs removed; suite-owned `box-bt1-*` dirs self-clean per test run.
- Reflect: the fix round was clean — each claim verified, and the residual attacks are all narrower than what they replaced. Round 1 FAIL was the right call; this round passes.
