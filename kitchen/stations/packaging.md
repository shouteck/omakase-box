# Station: Packaging

Selecting source for a Box, exporting it as a folder, proving it in a clean directory, submitting a patch from it, verifying that patch in the owner repository. D2/D3.1 and declared-command checks are built. A1 makes agreements neutral; A2 makes selection explicit and compares full-base/Box observations. A3 makes declared commands sufficient for neutral orchestration; ecosystem generation/install/compile remains explicit opt-in only.

## What this station knows

- A Box is a plain folder with `box.json`, selected source and declared setup/check commands. Prerequisites are arbitrary programs. Neutral A3 export/verify needs no pnpm or generated files; private-shop fixtures explicitly opt into the retained nodejs helper. Paired recipient checks require the same sourceRoot-relative paths in full base and Box.
- Name negative candidates by the actual source mutation. A cosmetic unused parameter is not the removed-parameter/unchanged-caller probe; a green alternative solution is not a wrong candidate.
- The design for the first fixture is in `docs/box-v4/delegation/SUPPORTED-CASE.md`: the `examples/private-shop` fixture, two supported requests (A: response security policy; B: deterministic ranking), the modules that must be absent from the export, and one unsupported coupling case.
- Reuse before writing: `packages/box-contracts` (Box schemas and hashing), `packages/analyzer` (import scanning), `packages/evaluation/patch-validation`.
- A2's `files` is the sole owner-source shipping authority. TypeScript `proposeSelection` supplies suggestions from entrypoints, never implicit export inputs. Owner-selected dependency files retain their bytes and provenance; optional generated helpers cannot overwrite them.

## Milestone BT: the bounty tool (from 10 October 2026)

The station's work is now the bounty tool: creating a bounty (the whole repository as a snapshot, never-ship files removed, with the task, the hand-off note and the check), the record that outlives the agent, taking an answer back, and telling agents the tool exists. PLAN.md has the journey and what is settled. A bounty folder is a Box of a new kind; reuse the Box's manifest, hashing, path handling and program launch.

- **The whole repository goes out, so never-ship is the security boundary.** Check each file's real path, fold case on both pattern and path, refuse links that leave the repository, and never list removed files' names inside the bounty. `packages/box-bounty/never-ship.ts` holds the rule table (C1 lesson folded in). Known still-shipping credential spellings left to the owner's `.boxignore`: `.kube/config`, `credentials.json`, `wp-config.php`, `id_x25519`, `backup_id_rsa`, `.env2`, `env.local`. The `secrets` rule matches any *segment* containing "secrets", basenames included — a legit `docs/secrets.md` cannot ship; tighten to directory segments if that bites.
- **Emitted bytes must equal the recorded identifier.** `bounty create` writes `repo/` from the snapshot commit via `git cat-file blob`, never the live worktree — one decision killed the TOCTOU, junction-swap and autocrlf findings. Keep it: a bounty whose bytes can drift from its identifier cannot be verified later. Corollary: clean filters (git-lfs) ship filtered bytes.
- **The snapshot commit keeps removed bytes reachable.** Never-ship files are absent from the bounty folder but their blobs sit in `.git/objects` under `snapshot.commit` until `gc` — required so the identifier resolves later; stated in BOUNTY.md, never a leak outside the machine.
- **A bounty outlives the agent that made it.** Anything a later session needs is written in the record, never left in a conversation.
- **Every outcome is a named state with a next step.** An empty or ambiguous answer from the tool cost a whole live trial once.
- **Wording is product.** A tool an agent is only told exists was not called; the description and the lines in a project's rules decide whether it is used. Test them by cold read.
- **The answer is verified against the version the bounty was made for, then brought forward.** Code moves on while a bounty is open.

## Tracing a failing test (wave C1, not used by milestone BT; kept for the smaller Box later)

The station now also covers tracing a failing test, choosing a Box's files from the trace, and the hand-off and return. Two product rules apply to every wave here: nothing leaves the owner's machine without the owner's yes, and never-ship files never enter a Box.

- **Identify a function by its file and the line its definition starts on, never by name.** The lab's first tracer marked a property setter as run because the getter of the same name had run.
- **Follow the test into every process it starts.** Five public tasks produced no usable trace because their tests ran in child processes.
- **Trace calls, not lines.** Line tracing of whole test files hit five-minute timeouts; call tracing of one test took about two seconds.
- **A line that ran is not a function that was called.** A definition line runs when its file is loaded. If a later wave reads a standard coverage report in place of the tracer, treat hits as regions, and leave anything uncertain unmarked.
- **A wrapper must behave exactly like the command it wraps.** The lab's search wrapper ran a search to completion before passing output on, which changed what a piped command returned and went unnoticed because the check replayed old commands. Test the commands an agent actually types, including pipes and early exits.
- **Offered is not used, and empty costs.** A tool an agent is only told about was not called; a tool that could return nothing cost real steps. Put the hand-off in the path of what the agent already does, and pilot one real use before any batch.
- The tracer prototype is on the `lab` branch (`lab/lines/box-trial/`). Read it with `git show origin/lab:<path>`; do not import from it. The product tracer is `packages/box-trace` (C1): a `sitecustomize.py` hook on `PYTHONPATH`, `sys.monitoring` primary with `settrace` fallback.
- **Traced is not all that ran.** `processes` counts reported processes; a Python child still running when the command exits writes its record after the merge and is silently absent. Cross-process `order` groups per process, never wall-clock. `no-python-process` conflates `-S`/`-I`/`-E`, `python --version`, `os._exit` and killed children.
- **The hook dir must not sit under the run root.** With cwd an ancestor of the hook's temp dir, the trace lists `sitecustomize.py` itself as repository code.
- **No `box` binary exists.** The command is `node packages/box-cli/dist/cli.js` after a build; doc pages and tests must say so.

## Traps

- **Workspace links and frozen installs:** missing dependency declarations can work via siblings, so prove a package outside the checkout. Pinned pnpm also backfills absent empty workspace importers during --frozen-lockfile, dirtying Git; K7-ci's importer-parity regression guards new manifests. Adding workspace package.json files requires root lock parity even with no dependencies.
- **Windows paths.** This machine uses backslashes and the recipient's may not. Store paths in the Box with forward slashes, build them with path functions, and test both forms.
- **The silent fallback.** If export cannot find something, it reports a named preparation gap. It never reaches back into the owner repository to fill the hole, and exporting the full source can never count as a pass.
- **The clean directory must be outside this checkout**, or module resolution will find the repository's `node_modules` on the way up.
- **Exclusion runs on the canonical path, not the spelling.** Two D2.1 bypasses proved it: a case-aliased entrypoint and an in-root junction both shipped `src/private/*` bytes while the declared path looked clean. `realpathSync` before BOTH the containment and the exclusion check; fold case on both sides; emit under the canonical path only. Note Windows realpath keeps declared case, so alias spellings can still reach emission on non-excluded paths — normalize if patch mapping ever sees them.

- **A clean install proves nothing.** With a needed sibling package missing, `npm ci` and `pnpm install --frozen-lockfile` both exit 0 and leave a dangling link (A0). Only a check that loads the code shows the gap.
- **`check` never reaches the box suites.** Its diff-reach map has no entry for `packages/box-package/` or `tests/box/`; `verify --full` alone proves nothing about this station's code. Briefs here must name `test:box-package` (and `test:box-*` as applicable) so the suite actually runs.
- **Equal red exits are not equal failures.** A2 pairs declared recipient checks in full-base/isolated-Box contexts and compares result, exit and full normalized decoded-text digest. Never compare display tails. JSON tuple framing separates stdout/stderr even with embedded NULs; beyond-tail and NUL-partition regressions caught two wrong implementations. Matching diagnostics remain observations, not causal proof.
- **A4 Windows npm declaration:** bare `npm` resolved an unspawnable extensionless shim on this host; fixture setup declares `npm.cmd` with `--ignore-scripts`. This is a host-specific recipe, not a portable executable claim. A4 proves npm/Python capability with unchanged core, immutable checks and retained pristine manifests; fixture checks are purpose-written and npm non-string inputs remain uncovered.
- **Windows shim quoting can silently change argv.** A1 dispatches `.cmd`/`.bat` by file kind through the system shell, not by tool name. Unsafe tokens, including trailing backslashes, are refused before spawn; embedded backslashes and supported metacharacters have real subprocess tests. Do not broaden quoting without negative tests.
- **Preflight all contexts before any declared setup.** Stage recipient files first, resolve owner and recipient programs plus prerequisites, then run commands. A1's sentinel regression catches the per-context ordering bug; missing recipient tools must not follow owner setup side effects.

## The pass checks

- Run export and declared checks outside the repository. Shared test setup must be invocation-local and isolated for mutation; try poisoned/preseeded cache bytes before trusting a speedup (K6 failed this check).
- Confirm the excluded modules are really absent from the package.
- Try each negative: omitted dependency, path or link escaping the selection, unlisted input, edit outside the editable paths, wrong base commit, altered agreement.
- Record the share of owner source the package disclosed.
