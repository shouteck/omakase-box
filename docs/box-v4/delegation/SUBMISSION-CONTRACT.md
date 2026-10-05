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
