# Station: Packaging

Selecting source for a Box, exporting it as a folder, proving it in a clean directory, submitting a patch from it, verifying that patch in the owner repository. D2/D3.1 and declared-command checks are built. A1 makes agreements neutral; A2 makes selection explicit and compares full-base/Box observations. A3 makes declared commands sufficient for neutral orchestration; ecosystem generation/install/compile remains explicit opt-in only.

## What this station knows

- A Box is a plain folder with `box.json`, selected source and declared setup/check commands. Prerequisites are arbitrary programs. Neutral A3 export/verify needs no pnpm or generated files; private-shop fixtures explicitly opt into the retained nodejs helper. Paired recipient checks require the same sourceRoot-relative paths in full base and Box.
- Name negative candidates by the actual source mutation. A cosmetic unused parameter is not the removed-parameter/unchanged-caller probe; a green alternative solution is not a wrong candidate.
- The design for the first fixture is in `docs/box-v4/delegation/SUPPORTED-CASE.md`: the `examples/private-shop` fixture, two supported requests (A: response security policy; B: deterministic ranking), the modules that must be absent from the export, and one unsupported coupling case.
- Reuse before writing: `packages/box-contracts` (Box schemas and hashing), `packages/analyzer` (import scanning), `packages/evaluation/patch-validation`.
- A2's `files` is the sole owner-source shipping authority. TypeScript `proposeSelection` supplies suggestions from entrypoints, never implicit export inputs. Owner-selected dependency files retain their bytes and provenance; optional generated helpers cannot overwrite them.

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
