# Station: Packaging

Selecting source for a Box, exporting it as a folder, proving it in a clean directory, submitting a patch from it, verifying that patch in the owner repository. Milestones D2 and D3.1. Nothing on this station is built yet.

## What this station knows

- A Box is a plain folder: `box.json`, the selected source, the lockfile and tool versions, non-sensitive fixtures. No server, database or container is needed to create or open one. The recipient's recipe is a Node version and a lockfile.
- The design for the first fixture is in `docs/box-v4/delegation/SUPPORTED-CASE.md`: the `examples/private-shop` fixture, two supported requests (A: response security policy; B: deterministic ranking), the modules that must be absent from the export, and one unsupported coupling case.
- Reuse before writing: `packages/box-contracts` (Box schemas and hashing), `packages/analyzer` (import scanning), `packages/evaluation/patch-validation`.
- How a Box selects its source has no precedent here. D2.1 opens with a prototype wave: two or three throwaway attempts compared on the same checks.

## Traps

- **Workspace links hide missing dependencies.** In this pnpm workspace a package can appear to work because a sibling installed its dependency. `packages/box-contracts` shipped without a lockfile entry for exactly this reason. A package is only proven when it installs and runs in a directory that contains nothing else.
- **Windows paths.** This machine uses backslashes and the recipient's may not. Store paths in the Box with forward slashes, build them with path functions, and test both forms.
- **The silent fallback.** If export cannot find something, it reports a named preparation gap. It never reaches back into the owner repository to fill the hole, and exporting the full source can never count as a pass.
- **The clean directory must be outside this checkout**, or module resolution will find the repository's `node_modules` on the way up.
- **Exclusion runs on the canonical path, not the spelling.** Two D2.1 bypasses proved it: a case-aliased entrypoint and an in-root junction both shipped `src/private/*` bytes while the declared path looked clean. `realpathSync` before BOTH the containment and the exclusion check; fold case on both sides; emit under the canonical path only. Note Windows realpath keeps declared case, so alias spellings can still reach emission on non-excluded paths — normalize if patch mapping ever sees them.

- **A clean install proves nothing.** With a needed sibling package missing, `npm ci` and `pnpm install --frozen-lockfile` both exit 0 and leave a dangling link (A0). Only a check that loads the code shows the gap.
- **A red check can be red for the wrong reason.** A check that fails because a file is missing looks the same as one that fails because the work is not done. Compare with the same check in the full repository.
- **On Windows, `npm` and other command-file shims cannot be started without a shell.** A script path that travels with the Box, started with `node`, is portable (A0).

## The pass checks

- Run export and declared checks outside the repository. Shared test setup must be invocation-local and isolated for mutation; try poisoned/preseeded cache bytes before trusting a speedup (K6 failed this check).
- Confirm the excluded modules are really absent from the package.
- Try each negative: omitted dependency, path or link escaping the selection, unlisted input, edit outside the editable paths, wrong base commit, altered agreement.
- Record the share of owner source the package disclosed.
