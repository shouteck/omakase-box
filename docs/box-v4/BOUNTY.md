# `box bounty` — a bounty, complete and safe, remembered in the project

GitHub posting is public and free, only to the project's own repository when
it is already public. Anyone can read the issue and the bounty branch. Nobody
is known to be watching these issues yet; the wait is unknown and there is no
reward. Private repositories and unreadable visibility are refused with no
override. A local folder remains available on every repository.

```
node packages/box-cli/dist/cli.js bounty create --task <file> --why "<one line>" \
    [--title "<one line>"] [--note <file>] [--job <file>] [--setup -- <command>] \
    [--check -- <command>] [--guard -- <command>] [--out <dir>] [--repo <path>] [--preview]
node packages/box-cli/dist/cli.js bounty help
node packages/box-cli/dist/cli.js bounty describe [--rules] [--repo <path>]
node packages/box-cli/dist/cli.js bounty remind [--repo <path>]
node packages/box-cli/dist/cli.js bounty status [--repo <path>]
node packages/box-cli/dist/cli.js bounty confirm <id> [--to github] [--preview] [--repo <path>]
node packages/box-cli/dist/cli.js bounty post <id> --to <dir|github> [--repo <path>]
node packages/box-cli/dist/cli.js bounty answer <id> [--from <dir> | --pr <n>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty apply <id> [<attempt>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty reject <id> --reason "<text>" [--repo <path>]
node packages/box-cli/dist/cli.js bounty withdraw <id> [--repo <path>]
node packages/box-cli/dist/cli.js bounty undo <id> [--repo <path>]
```

(If `dist/cli.js` is missing, build first with `node scripts/workspace.mjs build`.)

Run inside a Git checkout (or pass `--repo`) — `help` and `describe` work
anywhere; `help` prints the whole journey on one screen. `create` writes one folder and the
bounty's record; nothing else leaves the machine until `confirm` + `post` —
and `post` copies to a local folder you name or publishes the confirmed GitHub
listing and shipped source. Every outcome is a
named state: success ends `stage 1 of 7: drafted`; refusals print
`refused (<name>)` and exit 3; usage errors exit 2; operational failures
exit 1. `--task` and `--note` are embedded verbatim, so a path the never-ship
rules would remove is refused (`never-ship-input`).

## Post and collect on GitHub

The tool uses Git and `gh` already signed in on the machine. Sign in through
those programs, outside the tool. It never asks for, reads, stores or prints a
token. `origin` must have one fetch destination and one push destination, both
naming the same GitHub repository. Before any push, the tool reads that exact
repository's visibility and refuses private or unreadable visibility.

For a prepared bounty, show the exact listing before the owner approves it:

```
node packages/box-cli/dist/cli.js bounty confirm <id> --to github --preview
```

This changes nothing. It shows the repository, its public visibility, the exact
issue title and body, and `box-bounty/<id>` as the branch. Once the owner approves
that text, the owner's `.box/limits.json` must include `"github"` in
`"allowedDestinations"`. An absent list permits local folders only. Then run:

```
node packages/box-cli/dist/cli.js bounty confirm <id> --to github
node packages/box-cli/dist/cli.js bounty post <id> --to github
```

Confirmation records the listing and repository. Posting checks visibility
again. The pushed branch has exactly the manifest's shipped files and one
commit with no parent, so the owner's Git history and excluded files never
leave. The issue names the task, the hand-off note, check and level, omissions,
branch and answer instructions. The issue address, number and branch are kept
in the local record and shown by `status` and the open-bounties line.

The solver clones that branch alone, works at its root and opens a pull request
against it in the same repository. Collect from the project's record:

```
node packages/box-cli/dist/cli.js bounty answer <id>
node packages/box-cli/dist/cli.js bounty answer <id> --pr <number>
```

The first command lists open pull request numbers, authors and changed files.
`status` also reads the current issue state and open pull requests, so a later
session learns about a new answer from the record alone. It saves the observed
outside state and its time; the open-bounties line carries those answer facts.
If GitHub cannot be reached, `github-status-unavailable` names that outcome,
shows the last recorded outside state and when, and names `status` as the retry.
The second fetches the selected pull request without changing the working tree,
index or current branch. Its target must be the recorded bounty branch. The
existing answer boundary refuses never-ship additions and unsafe paths, extracts
the change and records a numbered attempt and a facts report.

**A stranger's code is never run on this host.** If the pull request's author is
different from the account signed in to `gh`, no setup, check or guard executes.
The report still names the change, flags and dry merge. The recorded outcome is
`check-not-run`, with the reason `foreign-author`. It cannot be applied, even by
naming the attempt explicitly. A contained run is needed and is a later wave;
there is no execution override. A pull request made by the signed-in account
uses the existing declared-check path. This proves that account's path, not
that a stranger has answered.

`apply`, `reject` and `withdraw` comment the recorded fact on the issue, close it
and remove the bounty branch. `undo` comments the reversal. If an outside step
fails, the local decision stands and the record names `github-decision-pending`
and the command to retry. That retry resumes outside work without repeating the
local merge or undo. `status` shows pending work even after a bounty has ended.
An undo after an unfinished apply update preserves both facts and finishes the
issue closure and branch removal. Retry uses the account that started the post;
comments or copied listings from other accounts cannot stand in for tool facts.

If a push succeeds but the issue cannot be opened, the refusal is
`github-post-incomplete`. The record states the known outside state. Repeat
`post <id> --to github` to finish; it recovers an issue whose response was lost
and never creates a second listing. To remove a partial post instead, run
`withdraw <id>`. Nothing here sends money or posts to a bounty site.
Withdrawal also finds and closes a successfully created issue whose response
was lost, before it clears the outside work.

`create` asks only for judgement — a task and one line of why; everything
mechanical has a default:

- **`--why "<one line>"` is required** — without it the refusal is named
  (`missing-why`), not a usage wall. It lives only in the record (like
  `--job`: never in `bounty.json`, the listing or the shipped folder), so
  the reasons for handing off can be learned from use.
- **`--title` defaults to the task's first non-empty line**, trimmed;
  `--title` still wins when given.
- **`--out` defaults to `bounties/<slug>` next to the repository root** —
  outside the checkout, where the slug is the title folded to
  `[a-z0-9-]` (`bounty` when nothing survives). Given or defaulted, the
  destination must land outside the repository (`out-inside-repo`) and must
  not already hold files (`out-dir-not-empty`).
- **`--note` defaults to a note the tool writes itself** — see *The note
  writes itself* below.

Both `--out` and `post --to` are judged on the path they would really land
at: the nearest *existing* ancestor is realpath-resolved and the missing
tail re-appended before the inside-the-repository check, so a nonexistent
target under a junction pointing into the checkout is refused, not written
inside it.

## Telling the agent

Three switchable pieces put the tool in front of an agent that has never seen
it — and the owner's limits file supplies the facts it needs to choose.

- **`describe`** prints the canonical description — what the tool does, when
  it is worth using and when it is not — plus the facts for choosing, read
  from `.box/limits.json` and the live records: cost, expected wait, where
  `post --to` may deliver, whether reminders are on, how an answer is judged
  (the level in the listing: `mechanical` — the declared check must exit 0;
  `reviewed` — a person reads it; facts about an answer, never a verdict) and
  the open-bounties line. It works outside a checkout too: outside one it
  prints the description and says the live facts need a repository. A fact the
  owner has not set says so — describe never prints nothing.
- **`describe --rules`** prints the block an owner pastes into a project's
  rules file — the rules lines and an `open bounties:` line between
  `<!-- box-bounty -->` / `<!-- /box-bounty -->` markers.
- **`remind`** prints the one line a harness can surface at a moment of
  difficulty (a failed attempt, budget running low). It is **off by default**
  — on only when the limits file sets `"reminders": "on"`. When off it says
  so in one line; it never prints nothing. The trigger belongs to the harness;
  `remind` only supplies the text and the switch.

### The open-bounties line the tool keeps current

`.box/bounties/OPEN` always mirrors the records —
`open bounties: bt-… "title" (stage), …` or `open bounties: none` — rewritten
on every record mutation. When the limits file names `rulesFile`, the marked
block inside that file is rewritten too on every mutation: the tool owns
everything between the markers (the rules lines plus the current
open-bounties line) and never touches a byte outside them. A file without the
markers — or one that does not exist — is left exactly as it was.

### The owner's limits file — `.box/limits.json`

Written once by the owner, read at the boundary (`.box` never ships):

```json
{
  "reminders": "off",
  "rulesFile": "AGENTS.md",
  "cost": "each bounty costs real money against the owner's account",
  "expectedAnswer": "usually a day; unknown is fine to say",
  "allowedDestinations": ["../bounty-drops"]
}
```

- `reminders` — `"off"` (default) or `"on"`; gates `remind`.
- `rulesFile` — optional path, resolved relative to the repository root, of
  the project rules file holding the marked block. It must land **inside**
  the checkout, judged on the canonical path — a junction or `..` spelling
  that resolves outside is refused (`rules-file-outside-repo`).
- `cost` / `expectedAnswer` — one free-text line each, shown by `describe` so
  an agent can weigh handing off against doing the work.
- `allowedDestinations` — optional list of local directories (repo-relative or
  absolute) that `post --to` must land inside, plus the literal `"github"` for
  GitHub posting; absent means any local folder and no GitHub posting,
  as before. Enforced on the canonical destination — a junction trick cannot
  slip past — and the refusal is named `destination-not-allowed`. An empty
  list means no destination is allowed.

A missing file means defaults. Malformed JSON, a non-object document or a
known field of the wrong shape is the named refusal `limits-malformed` —
read before anything mutates or posts, so a broken file never leaves a
half-written record. Unknown fields are ignored.

## The record — the bounty outlives the agent

`create` also writes `.box/bounties/<id>.json` inside the repository and prints
its path. The tool writes the file; committing it is the agent's normal flow.
The record holds the id, title, level, the snapshot identifier
(commit + tree + base), the absolute path of the bounty folder, and the stage
history — one event appended per transition, never rewritten:

```
drafted → confirmed → posted → taken → answered → verified → applied
                (ended early: rejected, withdrawn, expired;
                 an applied merge can be reversed by undo → undone)
```

`verified` is a waiting stage, not an ending: a mechanical answer that passes
its check stops there and nothing is merged until `apply` runs. A failing
answer does not end the bounty either — it is kept as a numbered **attempt**
and the record returns to `posted`, so another answer can come back. Every
answer is kept: `record.attempts[]` holds each one's commit, change, outcome,
conflict paths and report; `status` lists them, passing first. Records written
before attempts existed — a single `answer` on the record — load as attempt
number 1 and still apply.

A later agent in a later session reads the record — not your conversation — to
pick the bounty up. An optional `--job <file>` on `create` records the larger
piece of work waiting on the bounty; its text lives only in the record — never
in `bounty.json`, the listing or the shipped folder — and `status` names it
once the bounty ends (`applied`/`rejected`). The required `--why` line is kept
the same way: on the record only.

`create` also keeps a Git ref `refs/box-bounty/<id>` pointing at
`snapshot.commit`, so `git gc --prune=now` cannot take the bytes the identifier
names. Each answer lands as `refs/box-bounty/<id>-answer-<n>` — the answer is
parented on the snapshot's *base* commit, so it cannot keep the snapshot alive
and all refs exist while the bounty is open. Every ended stage — `applied`,
`rejected`, `withdrawn`, `undone` — removes them all.

## The commands after create

- **`help`** prints the whole journey on one screen — the stages, what each
  command does in one line, and what ends a bounty. It reads no repository,
  so it works outside a checkout too. A bare `box bounty` is a usage error
  pointing at it; an unknown verb is named in the message.
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
- **`apply <id> [<attempt>]`** merges a recorded attempt onto the current
  code. With one applicable attempt no number is needed; with more than one,
  `apply` refuses by name (`apply-ambiguous`) and prints the attempt numbers —
  pass one as `<attempt>` (`unknown-attempt` otherwise). On any other stage it
  is a named refusal (`wrong-stage`, `already-ended`).
- **`reject <id> --reason "<text>"`** ends a `posted`/`taken`/`answered`/
  `verified` bounty with the reason kept on the record — earlier stages end
  through `withdraw` instead (`wrong-stage`).
- **`withdraw <id>`** ends any open stage → `withdrawn`, removes the durability
  refs, and is safe to repeat: an already-withdrawn bounty is a named state, not
  an error. An unknown id is `unknown-bounty` everywhere.
- **`undo <id>`** reverses an applied merge — see *Undo an apply* below.

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
materialise for the check — the solver is judged on what they were given. The
check is then re-run on the *untouched* shipped set too: if it passes there, a
pass on the answer proves nothing, and the report flags it. When `--guard` was
declared it runs once more, after the check, on the answered set.

For a **`reviewed`** bounty there is no check to run: the answer lands at
`answered` and the report's next step names `box bounty apply <id>` or
`box bounty reject <id> --reason` — nothing claims a verification that did not
happen.

**`answer` reports facts, never a verdict.** A wrong fact is a bug we can
find; a wrong verdict misleads and cannot be traced — so the report is policed:
no "correct", "safe", "good", "recommended", "should accept" or
"should reject", in any outcome, and a test keeps it that way. Whatever the
check did, the report states only what was observed:

- `check:` — the declared command, its exit at `create` (it failed then — that
  is why the bounty exists) and its exit on the answer, with an output tail
  when there is any;
- `guard:` — the declared guard's exit on the answer, or `none declared`;
- `change:` — changed/added/deleted path counts and lines added/removed;
- `current code:` — a dry merge read (`git merge-tree --write-tree`) of the
  answer against the current branch, with the conflict paths when it would not
  land — the worktree, index and `HEAD` never move for the read;
- `flag:` lines — eager observations, never blocks: the answer edits a file the
  check command's own text names or one the stated rule marks as a test; files
  were added or deleted; the change is above the stated size; or the check
  passes on the untouched snapshot;
- `not checked:` — one always-present sentence saying the report is exits and a
  merge read only, not a verdict on behaviour the commands do not cover;
- `next:` — the exact next command.

A pass on the answer lands the bounty at `verified` and **stops** — nothing is
merged; `box bounty apply <id>` is the recorded decision. (The owner's limits,
a later wave, may switch an automatic apply back on for clean mechanical
passes.) A failing or
unrunnable check is recorded on the attempt (`implementation-failure` or
`environment-failure`, with exit and tail) and the bounty returns to `posted`,
still open — more answers are attempts 2, 3, … and `status` lists them,
applicable ones first. When several attempts could apply, `apply` names them
(`apply-ambiguous`) and `apply <id> <n>` picks one.

**Applying is a real git merge, never a file write.** The change becomes a
commit on the snapshot's base commit — the base tree plus the extracted delta
(built on a temporary index — the worktree and real index are never touched),
so the incoming side of the merge is the solver's change alone — and
`git merge` brings it onto the current branch as a merge commit whose message
names the bounty and the attempt. A conflict aborts the merge — the worktree
and index come back byte-identical — and the record keeps its stage with the
conflicting paths as the next step; fix them, commit, and `apply` retries, or
`reject` ends it. Work the merge would overwrite is refused by name
(`apply-worktree-dirty`) before it can run — uncommitted content on a touched
path, and any file that exists at a touched path but is not in the index (an
ignored file the merge would silently clobber) — never damaged. Applying one
attempt ends the bounty and removes every answer ref.

## Undo an apply

`box bounty undo <id>` reverses the merge `apply` made as a **new commit** on
the current branch that names the bounty (`reverses merge <sha>`), then moves
the record to `undone` — history is appended, never rewritten. Named refusals
change nothing: the bounty was never applied (`not-applied`), the merge is not
on this branch's history (`undo-not-on-branch`), staged changes sit in the
index (`undo-index-staged`), uncommitted work covers a path the reversal would
touch (`undo-worktree-dirty`), or a dry run of the reversal itself conflicts
(`undo-conflict`, paths named). After `apply` then `undo`, the tree is equal
to what it was before the apply.

## The note writes itself

Without `--note`, `create` composes the hand-off note from evidence it
gathers itself: the declared check with the exit and output tail it recorded
failing on this snapshot, and the files the working state already changed
relative to `snapshot.baseCommit` — named when they are part of the shipped
set, a moved submodule is labelled `submodule changed`, and a file the working
state deleted is named when no never-ship rule would have kept it out; a path
a rule covers is never named inside the bounty. Live paths are judged on the
canonical path — the one shipping was decided on — never the diff's spelling,
and renames are unfolded so a rename's source is still classified. A deletion
is judged by the base tree's own spellings instead: what the owner committed,
never what now occupies the path — a link planted where the file was cannot
rename the loss after its target, and a base file that ships only as a link's
view of another tracked path is named as gone — whether the link leaves the
diff silent (same bytes) or turns the deletion into a modification (different
bytes), and a rule-covered canonical never suppresses a rule-free base
spelling's change.
When every differing path is one that does not ship, the note says the state
differs only outside the shipped set — never that the tree matches the last
commit when it does not.
The composed note is marked `tool-written` in `bounty.json` and says so in
its first line. Gathering never crashes `create`: a repository with nothing
to report — no check, a clean tree — gets a plain note saying so. `--note`
still wins when given.

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

`--guard -- <command>` declares a second command that must *keep* passing —
think of it as the property the rest of the work must not break. It runs on the
shipped set at `create` and must exit 0 there: a failing guard is
`guard-failed`, one that cannot run is `guard-unrunnable`, both named
distinctly from the check's refusals, and no folder is written either way. The
guard is bound into `bounty.json`; `answer` reruns it after the check and
reports its exit as a fact — a red guard does not flip a verdict, the report
simply states it.

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
