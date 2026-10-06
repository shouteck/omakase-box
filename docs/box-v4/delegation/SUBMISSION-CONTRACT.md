# Submission contract: editable-overlay (D2.2)

The recipient holds only the exported Box folder: no repository, no `.git`, no box-cli.
The submission mechanism therefore travels inside the folder as `box/submit.mjs`, a
self-contained Node script (built-ins only) emitted by `box export` and named in
`box.json` at `submission.tool`.

## Recipient flow

1. Read `box.json` (`outcome`, `editable`, `checks`, `submission.instructions`).
2. Edit only the `editable[].box` paths; run `checks`.
3. `node box/submit.mjs [output]` writes the artifact (default `submission.json`).

`submit.mjs` refuses to run when a file recorded in `box.json.files` outside the
editable surface was modified or deleted — that is the in-folder tamper check.

## Artifact (validated by `SubmissionArtifactSchema` in `packages/box-package/submission.ts`)

`{ schemaVersion: 1, format: "editable-overlay", box: {id, name, version}, baseCommit,
agreementSha256, boxJsonSha256, files: [{box, owner, baselineSha256, sha256, content}] }`

Each `files` entry carries the full new UTF-8 content (not a diff), the hash of the
shipped baseline it started from, and the hash of the content. Binary editables and
files over 1 MiB are out of scope for this format.

## Binding chosen (of the wave's "hash of box.json and/or shipped baselines")

Shipped baselines, plus the agreement hash:

- `agreementSha256` binds the artifact to the owner agreement; an altered agreement or
  a `box.json` that drifts from it is `agreement-mismatch`.
- `files[].baselineSha256` is recomputed owner-side: `copy` editables against
  `git show <base>:<sourceRoot>/<owner>` (`.gitattributes` pins `-text`, so blob bytes
  equal shipped bytes); `generated-scaffold` editables against the deterministic
  generator output. A submission built on different starting bytes is
  `baseline-mismatch`.
- Scope: every submitted file must land on a declared editable with the declared
  owner mapping (`outside-editable`, `agreement-mismatch` on remap); a declared
  editable left out is `missing-editable`. Path comparisons fold case (the D2.1
  realpath wart: a case alias of a real editable is the same file, applied under the
  agreement-declared spelling).
- `boxJsonSha256` is recorded for audit and verified only when the owner supplies a
  pristine retained export via `--box` (`box-json-mismatch`). The recipient owns its
  own copy, so without a retained export this field is evidence, not a check.

Owner-side command: `node packages/box-cli/dist/cli.js submit <submission.json>
--agreement <agreement.json> --repo <path> [--box <dir>] [--base <sha>]`. It validates
and prints what it would apply (`applies[]` maps box paths to owner paths with
`changed` flags). Exit 0 accepted, 3 rejected with a named reason, 1 operational
error. Expected base resolves `--base` > `agreement.baseCommit` > repo HEAD and the
report names which source decided (`baseSource`). Verify + merge is D3.1.

## Declared commands, setup and prerequisites (A1)

An agreement declares programs, not tools. `setup[]` and `commands[]` are the same
shape — `{name, program, args, cwd, context, timeoutMs}` — with `commands[]` adding
`role: "guard" | "outcome"`. `program` is a bare executable name resolved on PATH (on
Windows with each `PATHEXT` extension in turn), an absolute path, or a relative
spelled-out path resolved against the command's context root on its canonical
path — a relative spelling that lands outside the context root is refused, so
`tools/x.cmd` always means the file inside the checkout or staged Box, never a
host-cwd accident. `args` reaches
the program verbatim with no shell anywhere; `cwd` must resolve inside the context
root on its canonical path. `setup[]` prepares a context before its checks and may
be empty. `requires[]` is `{program, version?}` — what a solver needs installed,
with an optional human-readable version, never a pinned toolchain the product
enforces.

Every declared program (setup, checks and `requires[]`) is resolved before the
first command executes in its context — owner-context programs and `requires[]`
against the owner repository before the disposable clone exists, recipient-context
programs against the staged Box folder before its setup runs; a missing one is
named and nothing has run in that context. A timeout or
spawn failure is a named result, never a pass and never a red outcome check.

One operating-system launch rule covers Windows command files: a program that
resolves to a `.cmd`/`.bat` (npm and pnpm are `npm.cmd`/`pnpm.cmd` shims) is
started through `cmd.exe /d /s /c` with the resolved path and each argument in
double quotes. The rule keys on the resolved file kind, never the program's
name. Arguments containing `"`, `%`, `!` or a line break cannot be carried on a
command line and are refused as an unsafe launch case; so is an argument ending
in a backslash, whose `\` would escape the closing quote under
CommandLineToArgvW and silently merge the next argument.

`package.json`/`tsconfig.json`/`pnpm-lock.yaml` are emitted only when the
agreement opts into the `nodejs` helper configuration; a Box for a
non-JavaScript project carries none of it. Installs the product itself spawns
(lockfile resolution, verify's scratch install) still carry `--ignore-scripts`
through the install boundary; declared commands are owner-approved execution
authority, not a sandbox.
