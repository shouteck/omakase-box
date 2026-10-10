# `box bounty create` — a bounty, complete and safe, on disk

```
node packages/box-cli/dist/cli.js bounty create --title "<one line>" --task <file> \
    [--note <file>] [--setup -- <command>] [--check -- <command>] --out <dir> \
    [--repo <path>] [--preview]
```

(If `dist/cli.js` is missing, build first with `node scripts/workspace.mjs build`.)

Run inside a Git checkout (or pass `--repo`). It writes one folder and nothing else
leaves the machine — posting is a later wave's job. `--out` must point outside the
repository (`out-inside-repo` otherwise — a bounty folder inside the checkout would
ship inside the next bounty). Every outcome is a named state: success ends
`stage 1 of 7: drafted`; refusals print `refused (<name>)` and exit 3; usage
errors exit 2; operational failures exit 1. `--task` and `--note` are embedded
verbatim, so a path the never-ship rules would remove is refused
(`never-ship-input`).

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
Being unreferenced, the commit survives normal use but an explicit
`git gc --prune=now`/`git prune` could remove it — BT2 keeps the durable record.

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
