# Station: Packaging

Selecting source for a Box, exporting it, proving it in a clean directory, submitting a patch from it, and the bounty tool's create → post → answer → apply journey on the owner repository. PLAN.md has the journey and what is settled.

This card holds rules, not narratives — each trap names the wave that taught it; read that wave file for the story. The retired platform's cards and the C1 tracer section are history (`archive/box-platform-2026-10`, waves A0–D3.1, C1).

## What this station knows

- A Box is a plain folder with `box.json`, selected source and declared setup/check commands; a bounty folder is a Box of a new kind — reuse the Box's manifest, hashing, path handling and program launch. Reuse before writing: `packages/box-contracts`, `packages/analyzer`, `packages/evaluation/patch-validation`.
- A2's `files` is the sole owner-source shipping authority; `proposeSelection` only suggests. The fixture design is `docs/box-v4/delegation/SUPPORTED-CASE.md` (`examples/private-shop`, requests A and B).
- **Facts, never verdicts.** The tool says "the check you set now passes", never "this answer is correct". Reports always say what was not checked (BT8c).
- **Every outcome is a named state with a next step**; an empty or ambiguous tool answer once cost a whole live trial.
- **Mechanical work is the tool's; judgement is the agent's.** Hand-off-or-not, the task text, accept-or-not: those three are the agent's. **Discretion, not enforcement** — nothing requires the tool's use; how it is described decides it. Say what it does, when it is worth it, and when not (BT4).
- **Wording is product** and lives in `packages/box-bounty/wording.ts` alone. **Changing a printed line means sweeping the suite for the old wording** — BT36's only FAIL was a stale bt11b assertion.
- Three hard stops only: never-ship, no private repository outside, the owner's standing rules. Do not add a refusal that polices a choice. A stranger's words are never the tool's words — solver text appears only when the agent asks, marked as the solver's.
- **Removing a capability means deleting it** with its tests listed in the Result — not a switch, not a bent assertion.
- **A failed measurement must say nothing, not a wrong fact** — check the comment's promise on the empty/failure path, not only the happy one (`merged.ts`, BT13).

## The security boundary

- **Never-ship is the security boundary: the whole repository goes out.** Check each file's real path, fold case on both pattern and path, refuse links that leave the repository, never list removed files' names. Rule table: `packages/box-bounty/never-ship.ts`. The `secrets` rule matches any *segment* containing "secrets", basenames included.
- **Emitted bytes equal the recorded identifier.** `bounty create` writes `repo/` from the snapshot commit via `git cat-file blob`, never the live worktree (TOCTOU/junction/autocrlf, BT6a-era). Clean filters (git-lfs) ship filtered bytes. The snapshot commit keeps removed blobs reachable under `.git/objects` — required, never a leak.
- **Nothing a solver wrote is ever run.** The unsafe-command preflight (`git.ts` `unsafeOwnerCommands`) models *what executes*, not which programs exist: `sh -c` filter/driver values, bare interpreters reading stdin, `alias.*`/`-c` re-entry, includes resolving against their own file's dir with `~`, launchers reading in-repo manifests (BT6b, three passes). Once a program places outside the tree, every operand deciding what executes must place or recurse — enumerating dangerous programs loses.
- **No token-shaped literal in tracked source, anywhere — including wave files.** Push protection scans every commit's bytes; build scan-pattern values at run time, describe shapes in docs, run `scanText` over added diff lines. Standing guard: `tests/box/bounty/secret-literals.test.ts` (BT8).
- **A path the tool writes needs a component walk, not `existsSync`** — a dangling symlink's missing target skipped the escape check (BT9; `instructions.ts` walker is the approach).
- **Anything printed from stored records is hostile input on second read.** Shape-check fields at `asRecord` and degrade a bad record to a named corrupt fact (BT9). Stored free text is a replay surface: removed command names survived in `github.outside.answers` — migrations scrub stored fields, not only renders (BT7c).
- **What goes public later must read what already went public, not the editable record** — `boundAmount` reads `amount` inside `record.github.body`; close PATCHes only `state` (BT11a). `github.body` re-POSTed verbatim on resume is a recorded crash-window surface (BACKLOG).
- **Publish the verified value, not a mutable name that resolves it again** — push `<provenSha>:<ref>` and record that SHA (`bt32-pass-toctou.test.ts`, BT32).
- **Do not weaken a security control to make a test pass.** A merging-foreign-bytes boundary is not a call: refused merges can still smudge bytes (autocrlf), merge ignores untracked *and ignored* files at touched paths — byte-identity after abort needs raw save/restore; parse `status --porcelain -z` untrimmed; test the default state, not `git add -A` (BT3b).

## Git and path traps

- **Windows paths:** store forward slashes, build with path functions, test both forms. `realpathSync` does not expand 8.3 names — only the parent's `readdir` reveals the true name; segment checks run on re-spelled, declared and canonical spellings (BT26). Exclusion runs on the canonical path — `realpathSync` before BOTH containment and exclusion (D2.1's two bypasses).
- **Git output is a third path dialect and it folds.** `diff`/`ls-tree` emit tree spellings (junction-tracked) and `diff.renames` drops rename sources — canonicalize and pass `--no-renames`; judge deletions by the *base tree's* spellings, never live disk (BT3b).
- **Junctions leave no git artifact** — where the note cannot know, report a change, never the all-clear (`waves/BT3b.md`).
- **`rev-list --ancestry-path` is not "did it land"** — for a merge carried inside another merge it returns nothing; use binary search of the first-parent chain with `merge-base --is-ancestor` (BT7b-1).
- **Read a merge without running one:** `git merge-tree --write-tree` (git ≥2.38) — clean exit, named conflicts, byte-untouched worktree.
- **Git output over history needs an explicit buffer** — set `maxBuffer`, fail by name on read error (K15-ci ENOBUFS).
- **A fixture that mints commits must make each distinct by construction** — one-second timestamp resolution deduped two solver PRs into the wrong merge (BT11b).
- **Commit-creating git calls carry their own identity** — `-c user.name=`/`-c user.email=` inline or via `support.ts` `git()`; a raw call passed locally for weeks, failed hosted (BT32-ci). Fixture hosts carry the owner's `~/.gitconfig` — a resolve-only `git-lfs` stub must be on stripped PATHs (`github-fixture.ts` `withoutGh`).

## Fixtures, suites and journeys

- **`check` never runs the bounty suite** — briefs name `test:box-bounty` and `test:kitchen`; only `verify --full` selects both. Plan the inner loop by file: `node scripts/suite.mjs box --suite bounty <file.test.ts>` (repo-relative path; BT21/BT22).
- **Three GitHub stand-ins exist** (`tests/box/bounty/github-fixture.ts`, `bt7-ux-fixture.mjs`, `kitchen/demo/gh-standin.cjs`) — a response-shape change greps and fixes all three (BT16, K18).
- **A declared setup must bootstrap from nothing** — a snapshot carries no `node_modules`; prove it in a copy with `.git`/`node_modules`/`dist` deleted (BT5). What setup creates, the solver must remove — `answer` counts install/build artifacts as `added` (recorded unfixed product decision, BT5).
- **A scenario's missing capability must be unfetchable**, and a bounty is only viable where its check can pass on the owner's machine (BT5 rungs).
- **Repo-local tool state:** `.box/bounties/` is inside the repository by design; the test `fingerprint` excludes `.box`. Since BT31 records live in `.box/local/box.db` (`node:sqlite` WAL, plain substring search, Node floor 22.13); call `closeStores()` before deleting a repo folder on Windows. **Never depend on an optional SQLite compile flag** (BT31-ci).
- **Windows-only semantics are pinned host-only** by platform or capability probe so suites run off-machine (K10): junctions, `.cmd` launch, the `npm.cmd` recipe (A4), case-insensitive FS.
- **Restricted host access can fail fixture setup before product assertions** (BT27 EPERM) — read diagnostics before calling it a regression.
- **Long foreground runs need a heartbeat on this host** — the exec host backgrounds ~10 s of silence; verify completes via a `$TEMP` log + ticker (K22-era).
- K14 counts Git process starts: new checks ride the pin layer's single `git config` read; pre-check `.git/index` bytes in Node before spawning `ls-files`; K14 measures the **built `dist`** — rebuild before trusting a start count.
- **A copy of a stranger's tree is a second boundary** — what may run there (info/attributes, hooks), which byte form lives there, what is checked on the way back; `git worktree remove` deletes before registration and fails on Windows while a process sits in the folder (BT7, parked).
- **Verify outside state independently** (`gh api`, `git ls-remote`), never the tool's word; a long silent `gh` call is normal on this host (BT6 Part C). `undone` is terminal; closed-by-base-deletion reads as rejection (BT6a). `allowedDestinations` gates both directions.
- **Fresh-reader/measurement journeys reuse `bt8b-fixtures.mjs`** (per-case repos + isolated settings from the built CLI of the exact SHA); cold fresh-agent journeys reuse the `bt17-measure.mjs` world (see evidence card).
- Name negative candidates by the actual source mutation — a cosmetic change is not a probe; a green alternative is not a wrong candidate. **A clean install proves nothing** — only a check that loads the code shows a dangling link (A0). **The silent fallback:** export never reaches back into the owner repository to fill a gap.
- **A produced artifact is not evidence of what it claims** — rebuild from the current commit before recording or demoing (K16 stale dist; evidence card).
- **Splitting a hub: outward calls decide the new modules' inbound edges**; count re-exports and inline type imports — the complete graph found 18 cycles where a scan found three (BT25/BT27).
- **Parseable is not the promised wire format** — validate or normalize at the boundary; test malformed *and* parseable-but-nonconforming (BT35).
- **Retirement inventories need document callers too** — check the roadmap, active briefs and contracts before removing a document (K29).

## The pass checks

- Run export and declared checks outside the repository; try poisoned/preseeded cache bytes before trusting a speedup (K6).
- Confirm excluded modules are really absent; try each negative: omitted dependency, escaping path or link, unlisted input, edit outside editable paths, wrong base commit, altered agreement.
- Record the share of owner source the package disclosed.
- Verify any outside claim independently before repeating it.
