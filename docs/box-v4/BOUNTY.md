# `box bounty create` — a bounty, complete and safe, on disk

```
node packages/box-cli/dist/cli.js bounty create --title "<one line>" --task <file> \
    [--note <file>] [--setup -- <command>] [--check -- <command>] --out <dir> \
    [--repo <path>] [--preview]
```

Run inside a Git checkout (or pass `--repo`). It writes one folder and nothing else
leaves the machine — posting is a later wave's job. Every outcome is a named state:
success ends `stage 1 of 7: drafted`; refusals print `refused (<name>)` and exit 3;
usage errors exit 2; operational failures exit 1.

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
`--preview` prints that and writes nothing.

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

```
GIT_INDEX_FILE=$(mktemp) git read-tree <commit>
GIT_INDEX_FILE=$(mktemp) git checkout-index -a --prefix=<target>/
```

or `git archive <commit> | tar -x -C <target>`. The shipped `repo/` is that tree
minus never-ship removals; `snapshot.tree` and the per-file hashes in
`bounty.json` let a later wave verify an answer against exactly these bytes.
Being unreferenced, the commit survives normal use but an explicit
`git gc --prune=now`/`git prune` could remove it — BT2 keeps the durable record.

## Never-ship

Built in, not overridable in this wave, checked on each file's **real path**
(realpath-resolved, case-folded) so spelling, case and links cannot bypass it:

- `dot-git` — any `.git` path segment
- `dot-env` — `.env`, `.env.*`, `.envrc*` basenames
- `secrets-dir` — any `secrets/` segment
- `runtime-dir` — any `.runtime/` segment
- `private-key` — `*.key *.pem *.p12 *.pfx *.jks *.keystore *.ppk *.gpg`, `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519` (and their `.pub` companions)
- `certificate` — `*.crt *.cer *.der`
- `credentials-file` — `.netrc .pgpass .htpasswd .git-credentials .npmrc .pypirc .dockercfg`, `.aws/credentials`, `.docker/config.json`
- `owner-list` — patterns from `.boxignore` at the repository root:
  `name` (file or dir, any depth), `name/` (dir contents), `*.ext` (basename
  glob), `dir/*.ext` (root-anchored glob), `/exact/path`. `#` comments, no `!`
  negation — patterns can only remove, never re-include.

A link or junction inside the repository that resolves **outside** it is refused
by name (`link-escape`) — never followed. A snapshot path that cannot be read
(broken link, link to a directory, vanished mid-scan) is `unreadable-path`.

**Limit:** there is no content scanning in this wave — a secret inside an
ordinary-looking file name ships. `.boxignore` is the catch-all for those.
