# `box bounty` — a bounty, complete and safe, remembered in the project

```
node packages/box-cli/dist/cli.js bounty create --title "<one line>" --task <file> \
    [--note <file>] [--job <file>] [--setup -- <command>] [--check -- <command>] \
    --out <dir> [--repo <path>] [--preview]
node packages/box-cli/dist/cli.js bounty status [--repo <path>]
node packages/box-cli/dist/cli.js bounty confirm <id> [--repo <path>]
node packages/box-cli/dist/cli.js bounty post <id> --to <dir> [--repo <path>]
node packages/box-cli/dist/cli.js bounty answer <id> --from <dir> [--repo <path>]
node packages/box-cli/dist/cli.js bounty apply <id> [--repo <path>]
node packages/box-cli/dist/cli.js bounty reject <id> --reason "<text>" [--repo <path>]
node packages/box-cli/dist/cli.js bounty withdraw <id> [--repo <path>]
```

(If `dist/cli.js` is missing, build first with `node scripts/workspace.mjs build`.)

Run inside a Git checkout (or pass `--repo`). `create` writes one folder and the
bounty's record; nothing else leaves the machine until `confirm` + `post` — and
`post` only ever copies to a local folder you name. `--out` must point outside
the repository (`out-inside-repo` otherwise — a bounty folder inside the
checkout would ship inside the next bounty). Every outcome is a named state:
success ends `stage 1 of 7: drafted`; refusals print `refused (<name>)` and
exit 3; usage errors exit 2; operational failures exit 1. `--task` and `--note`
are embedded verbatim, so a path the never-ship rules would remove is refused
(`never-ship-input`).

## The record — the bounty outlives the agent

`create` also writes `.box/bounties/<id>.json` inside the repository and prints
its path. The tool writes the file; committing it is the agent's normal flow.
The record holds the id, title, level, the snapshot identifier
(commit + tree + base), the absolute path of the bounty folder, and the stage
history — one event appended per transition, never rewritten:

```
drafted → confirmed → posted → taken → answered → verified → applied
                (ended early: rejected, withdrawn, expired)
```

A later agent in a later session reads the record — not your conversation — to
pick the bounty up. An optional `--job <file>` on `create` records the larger
piece of work waiting on the bounty; its text lives only in the record — never
in `bounty.json`, the listing or the shipped folder — and `status` names it
once the bounty ends (`applied`/`rejected`).

`create` also keeps a Git ref `refs/box-bounty/<id>` pointing at
`snapshot.commit`, so `git gc --prune=now` cannot take the bytes the identifier
names. When an answer lands, a second ref `refs/box-bounty/<id>-answer` pins
the answer commit — the answer is parented on the snapshot's *base* commit, so
it cannot keep the snapshot alive and both refs exist while the bounty is
open. Every ended stage — `applied`, `rejected`, `withdrawn` — removes both.

## The commands after create

- **`status`** lists every open bounty with id, title, stage and the next step —
  and never prints nothing: an empty `.box/bounties/` says so and says what to
  do. Ended bounties are one compact line.
- **`confirm <id>`** records the owner's yes (drafted → confirmed) with a
  timestamp. The owner's yes is the boundary: nothing is delivered before it.
  Confirming a bounty that is not drafted is refused (`not-drafted`).
- **`post <id> --to <dir>`** is the first delivery, and it is gated: unconfirmed
  → `not-confirmed`; the recorded folder gone → `folder-missing`; its
  `bounty.json` naming a different id → `folder-mismatch`; the destination
  inside the repository → `destination-inside-repo`; `<dir>/<id>` already
  existing → `destination-exists`. On success it **copies** the bounty folder to
  `<dir>/<id>/` (the recorded folder stays) and marks the bounty `posted` with
  the destination recorded.
- **`answer <id> --from <dir>`** takes the returned bounty folder — see *The
  answer comes back* below.
- **`apply <id>`** merges a recorded answer onto the current code — for a
  `reviewed` bounty at `answered`, and to retry after a merge conflict. On any
  other stage it is a named refusal (`wrong-stage`, `already-ended`).
- **`reject <id> --reason "<text>"`** ends a `posted`/`taken`/`answered`/
  `verified` bounty with the reason kept on the record — earlier stages end
  through `withdraw` instead (`wrong-stage`).
- **`withdraw <id>`** ends any open stage → `withdrawn`, removes the durability
  ref, and is safe to repeat: an already-withdrawn bounty is a named state, not
  an error. An unknown id is `unknown-bounty` everywhere.

## The answer comes back

The solver hands back the **whole bounty folder**: the original `bounty.json`
plus a `repo/` they edited — nothing else to write, no diff format to learn.
`answer` binds it before anything runs:

- `bounty.json` must name this bounty's `id` and this `snapshot.commit` — a
  folder returned for another bounty or another version is refused
  (`answer-mismatch`, `snapshot-mismatch`). Its bytes must also be identical to
  what `create` shipped (the record pins the manifest's sha256): a doctored
  manifest is `manifest-tampered`. **Return the folder with `bounty.json`
  untouched; edit `repo/` only.**
- The answer lands only on a `posted` bounty (`not-posted`); an ended bounty
  refuses every further transition (`already-ended`).

The change is then extracted by comparing `repo/` against the manifest's
recorded per-file sha256: changed, added and deleted paths — no diff text, no
git inside the answer. A return that changes nothing is `answer-empty`. Paths
the never-ship rules would strip (`.git`, `.box`, secrets, keys, and anything
the owner's `.boxignore` names — the same table that applied at `create`) and
links of any kind inside `repo/` are refused by name (`answer-never-ship`,
`answer-unsafe-path`); everything else — including brand-new files — is the
answer, and it is the merge commit that carries it into history.

For a **`mechanical`** bounty the *shipped set* — exactly the manifest's file
list, emitted as recorded blob bytes from `refs/box-bounty/<id>` — is recreated
in a clean directory (a pruned ref is `snapshot-lost`), the change applied,
and the declared setup+check run exactly as `create` ran them on the folder it
shipped. Never-ship files and `.box` records inside the snapshot commit never
materialise for the check — the solver is judged on what they were given. Pass
→ `verified`, then `apply` runs automatically. A check that ran and failed ends
the bounty `rejected` with `implementation-failure`, the exit and the output
tail recorded; a setup or check that cannot run is `environment-failure` — a
different state, same ending.

For a **`reviewed`** bounty there is no check to run: the answer lands at
`answered` and the next step names `box bounty apply <id>` or
`box bounty reject <id> --reason` — nothing claims a verification that did not
happen.

**Applying is a real git merge, never a file write.** The change becomes a
commit on the snapshot's base commit — the base tree plus the extracted delta
(built on a temporary index — the worktree and real index are never touched),
so the incoming side of the merge is the solver's change alone — and
`git merge` brings it onto the current branch as a merge commit whose message
names the bounty. A conflict aborts the merge — the worktree and index come
back byte-identical — and the record keeps its stage with the conflicting
paths as the next step; fix them, commit, and `apply` retries, or `reject`
ends it. Work the merge would overwrite is refused by name
(`apply-worktree-dirty`) before it can run — uncommitted content on a touched
path, and any file that exists at a touched path but is not in the index (an
ignored file the merge would silently clobber) — never damaged.

## What the folder contains

```
<out>/
  README.md      the listing: what is wanted, how to set up, how the check is run,
                 what counts as done — enough for a stranger to act on
  bounty.json    the manifest: id, title, task, note, setup/check, level, the
                 snapshot identifier, every shipped file's sha256 + bytes, totals,
                 the never-ship rules that applied with removal counts (no names),
                 and the recorded check exit + output tail
  repo/…         the snapshot: the repository as it stands — tracked files with
                 uncommitted changes plus untracked files that are not ignored;
                 no .git, no history
```

## The preview

Before anything is written the command prints exactly what would leave: file and
byte counts, which never-ship rules removed how many files (locally the removed
names are listed), the task, the check and its level, and the destination.
`--preview` prints that and writes nothing — except the snapshot objects: the
preview is computed from the recorded commit, so it already exists unreferenced
in `.git/objects` when the preview returns.

## The check really fails today

With `--check`, the tool copies the finished snapshot into a clean directory
outside the checkout and runs `--setup` then `--check` there as a solver would
(argv verbatim, no shell; `.cmd` shims launch through cmd.exe per the declared-
command rule). If the check exits 0 there is nothing to solve — refused
(`check-already-passes`), no folder. A check or setup that cannot run is refused
with the program named (`check-unrunnable`, `setup-unrunnable`, `setup-failed`).
The check's exit and output tail are recorded in `bounty.json`.

## Level

`mechanical` — a check exists and fails today; the answer must make it exit 0
without breaking anything else. `reviewed` — no check; the listing says a person
reads the answer. (`example` needs the owner to confirm a drafted example; that
arrives in a later wave.)

## The snapshot identifier

`snapshot.commit` in `bounty.json` is a real commit object in the repository's
own object store, parented on HEAD, recording the whole working state — created
through a temporary index (`GIT_INDEX_FILE` + `read-tree` + `add -A` +
`write-tree` + `commit-tree`), so the working tree, the index and the current
branch are byte-for-byte untouched, and no ref points at it. To recreate the
snapshot later, in that repository:

Git Bash:

```
GIT_INDEX_FILE=$(mktemp) git read-tree <commit>
GIT_INDEX_FILE=$(mktemp) git checkout-index -a --prefix=<target>/
```

PowerShell:

```
$env:GIT_INDEX_FILE = (New-TemporaryFile).FullName; git read-tree <commit>; git checkout-index -a --prefix=<target>/; Remove-Item Env:\GIT_INDEX_FILE
```

or `git archive <commit> | tar -x -C <target>`.

The bytes in `repo/` are read back **from that commit**, not from the working
tree, so what ships is byte-for-byte what the identifier pins (blob bytes —
Git's eol and attribute filters never apply on the way out, whatever autocrlf
says) and a file changed between the preview and the write cannot smuggle in
other bytes. The shipped set is that tree minus never-ship removals;
`snapshot.tree` and the per-file hashes in `bounty.json` let a later wave verify
an answer against exactly these bytes. Note the corollary: removed files' bytes
remain reachable to anyone with repository access through `snapshot.commit` —
the folder ships only the trimmed set, the commit records the full state.
The commit is pinned under `refs/box-bounty/<id>` (written by `create`, removed
when the bounty ends), so garbage collection cannot prune it while the bounty
is open.

## Never-ship

Built in, not overridable in this wave, checked on each file's **real path**
(realpath-resolved, case-folded) so spelling, case and links cannot bypass it:

- `dot-git` — any `.git` path segment
- `dot-env` — `.env`, `.env.*`, `.envrc*` basenames, and env-file spellings
  ending in `.env` (`prod.env`, `staging.env`). `.env.example`-style suffixes
  count too — templates carry real values often enough.
- `secrets-dir` — any path segment containing `secrets` (`secrets/`,
  `secrets-backup/`, `mysecrets/`); deliberately plural so `secretary/` and
  `secretariat/` do not match
- `runtime-dir` — any `.runtime/` segment
- `dot-box` — any `.box` path segment: the tool's own records under
  `.box/bounties/` never ship inside a later bounty. Exact segment only, so
  `.boxignore` itself still ships (and still means nothing to this rule).
- `private-key` — `*.key *.pem *.p12 *.pfx *.jks *.keystore *.ppk *.gpg`,
  and any basename starting `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`
  (`id_rsa.pub`, `id_rsa_backup`, `id_rsa.old` all count)
- `certificate` — `*.crt *.cer *.der *.cert *.p7b *.p7c *.asc`
- `credentials-file` — `.netrc .pgpass .htpasswd .git-credentials .npmrc .pypirc .dockercfg .yarnrc .yarnrc.yml`, `.aws/credentials`, `.docker/config.json`
- `owner-list` — patterns from `.boxignore` at the repository root:
  `name` (file or dir, any depth), `name/` (dir contents), `*.ext` (basename
  glob), `dir/*.ext` (root-anchored glob), `/exact/path`. `#` comments, no `!`
  negation — patterns can only remove, never re-include. Like every other rule,
  patterns match case-folded on the canonical path.

A link or junction inside the repository that resolves **outside** it is refused
by name (`link-escape`) — never followed. A snapshot path that cannot be read
(broken link, link to a directory, vanished mid-scan) is `unreadable-path`.

**Limit:** there is no content scanning in this wave — a secret inside an
ordinary-looking file name ships. `.boxignore` is the catch-all for those.
