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
- Commit: 24a2822a42e24ccc4a67aa5a2adaecd9dae84991 (reviewed exactly this; tree clean after removing scratch probes)
- Verify: `verify 24a2822 PASS check=0 build=0 test:box-bounty=0 db=embedded 144s` — recorded run `2026-10-10T01-07-40-935Z-24a2822` (clean tree, all steps 0); plus my own scoped `suite.mjs box --suite bounty` on this SHA: 27/27 pass
- Verdict: **FAIL** · Level: ui-verified (real built CLI driven end-to-end in both shells; findings demonstrated behaviourally, not just read)
- Lenses:
  - **Security:** the core rule holds under every attack — tracked/untracked/case-aliased/junction-reached/nested/owner-listed secrets stayed out and an outside link was refused by name. Two breaks found: `.boxignore` patterns are not case-folded, so `Private/` or `*.PEM` silently never match (docs say case-folded); and a mutation between plan and emit ships swapped bytes, including outside bytes through a swapped junction. Spellings that ship: `prod.env`, `staging.env`, `id_rsa_backup`, `.yarnrc`, `*.cert/.p7b/.asc`, `secrets-backup/`, `mysecrets/`. `--task .env` embeds the file's bytes verbatim into bounty.json and README. Secret added between preview and write cannot enter (the shipped set is pinned by the snapshot commit).
  - **User experience:** built my own Python repo (uncommitted edit, untracked file, two fake secrets) and drove the CLI from Git Bash, and a Node repo from PowerShell: preview is complete, refusal and success states are named, the folder's README lets a stranger say what is wanted (`repo/` + `python check.py` exits 0 = done). Fresh-agent pass done by me acting from BOUNTY.md alone (the pass may not spawn agents): the doc was enough to succeed; gaps — no build step for missing `dist/cli.js`, the recreate recipe is bash-only, and it never says removed files' bytes remain reachable via `snapshot.commit` in `.git/objects`.
- Method: read the full diff (scope clean: only `packages/box-bounty`, the `bounty create` CLI branch, `tests/box/bounty`, the doc page, one package.json line; export/submit/verify/trace untouched); relied on the recorded verify (no named doubt); wrote a scratch vitest probe file driving `planBounty`/`finalizeBounty` with hostile mutations, ran it scoped, removed it; manual CLI runs in both shells; direct `git ls-tree` repro for the quoting bug.
- Findings and limits:
  - **Blocking:** (1) any non-ASCII filename makes the whole create refuse as `unreadable-path` — `git ls-tree --format` still applies `core.quotepath` quoting despite `-z` (proved: `blob "\303\274n\303\257code.txt"` vs `blob ünïcode.txt` with `-c core.quotepath=false`); fail-safe but wrong, one-line fix. (2) `.boxignore` patterns are matched case-sensitively against the folded canonical path — an owner pattern containing any uppercase silently protects nothing (proved: `SecretDir/` and `*.KEY2` both shipped their targets).
  - **TOCTOU (admitted by cook, confirmed):** bytes are emitted from the live worktree, not the recorded tree — a file swapped after `add -A` ships swapped bytes, and a directory swapped for an outside junction ships outside bytes under an inside name. Shipped *paths* are pinned by the snapshot commit; only existing paths' bytes/links can change. Window is intra-run.
  - **`--task`/`--note` bypass never-ship:** any readable file (`.env` proved) is embedded verbatim in `bounty.json`/`README.md` — the preview shows the text locally, but nothing refuses a never-ship path.
  - **Confirmed admitted weak spots:** outside junction with only ignored content is silently absent (no refusal, nothing ships); unreachable snapshot commit retains removed files' bytes in `.git/objects` and `snapshot.commit` in the shipped `bounty.json` resolves them (doc implies, never states); `.env.example` is excluded (per spec); no content scanning (documented limit).
  - **Smaller:** file deleted between plan and emit dies as raw `ENOENT` exit 1 (unnamed state); `--out` inside the repo lets a previous bounty folder ship inside the next; `--preview` still writes unreferenced git objects; `repo/` ships worktree bytes while `snapshot.tree` holds filter-cleaned bytes — "exactly" recreates blob bytes and depends on autocrlf parity (doc recipe unpinned, test pins it); named states `setup-failed`, `unreadable-path`, `out-dir-not-empty`, `invalid-boxignore` have no tests; README misses a blank line before `## How you know you are done` when no setup.
- Merged: not merged — back to the cook. · Resources removed: scratch probe test deleted; probe temp dirs under `%TEMP%\box-bt1-*` are test-owned and clean themselves up on next suite run pattern.
- Reflect: the never-ship boundary was attacked hard and mostly held; the two fixes are small (pass `-c core.quotepath=false` to ls-tree; fold `.boxignore` patterns before compiling). A unicode-filename test would have caught finding 1 — worth adding either way.
