# `box bounty` — a bounty, complete and safe, remembered in the project

GitHub posting is public and free, only to the project's own repository when
it is already public. Anyone can read the issue and the bounty branch. Nobody
is known to be watching these issues yet; the wait is unknown and every bounty
states a reward of $0 — no payment exists. Private repositories and unreadable
visibility are refused with no override. A local folder remains available on
every repository.

A bounty is the task, what was tried, the one line of why, and the code —
nothing else. **Nothing a solver wrote is ever run by the tool:** checks were
removed on 11 October 2026, so `create` accepts no command flags at all —
`--setup`, `--check` and `--guard` are each a named refusal (`checks-removed`)
— and collecting, reporting and applying an answer runs no script,
hook, filter, merge driver or submodule fetch the answer carries. An answer
from any account can be listed, read and merged; choosing is always the
agent's or the owner's.

```
node packages/box-cli/dist/cli.js bounty create --task <file> --why "<one line>" \
    [--title "<one line>"] [--note <file>] [--job <file>] [--resume "<short note>"] \
    [--out <dir>] [--repo <path>] [--preview]
node packages/box-cli/dist/cli.js bounty [--repo <path>]
node packages/box-cli/dist/cli.js bounty help
node packages/box-cli/dist/cli.js bounty describe [--rules] [--repo <path>]
node packages/box-cli/dist/cli.js bounty status [id] [--full] [--comments] [--repo <path>]
node packages/box-cli/dist/cli.js bounty post <id> --to <dir|github> [--with-changes] [--include <file>] [--preview] [--repo <path>]
node packages/box-cli/dist/cli.js bounty look [id] (<n> | --from <dir>) [--full] [--repo <path>]
node packages/box-cli/dist/cli.js bounty apply [id] [<n> | --from <dir>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty close [id] [--reason "<text>"] [--repo <path>]
```

The owner has three commands. An agent can run them after the owner's decision:

```
node packages/box-cli/dist/cli.js bounty allow [owner/name|waiting-id] [--ask] [--repo <path>]
node packages/box-cli/dist/cli.js bounty deny [owner/name] [--repo <path>]
node packages/box-cli/dist/cli.js bounty config [set|add|remove <setting> <value>] [--repo <path>]
node packages/box-cli/dist/cli.js bounty status --since <iso> [--repo <path>]
```

The commands folded away — `answer`, `questions`, `reply`, `undo`,
`reject`, `withdraw`, `remind` (BT7c) and `confirm` (BT8) — each refuse by
name (`command-removed`) and say what took their place; none survives as a
hidden alias.

A fresh copy — a git clone, or the snapshot a bounty ships — contains no
`node_modules` and no built output, so `dist/cli.js` is missing until three
steps run, in this order:

```
npm ci --prefix scripts/tooling --ignore-scripts
node scripts/pnpm.mjs install --frozen-lockfile
node scripts/workspace.mjs build
```

The first step exists because `scripts/pnpm.mjs` wraps the repository-local
pnpm in `scripts/tooling`: until `npm ci` restores it, the install cannot
even start — it fails with "Repository-local pnpm is unavailable". That is
the step a warm checkout hides. It applies to any fresh copy, not only a
bounty.

Two programs are external requirements, checked where they are needed and
nowhere else: **Git 2.40 or later** (merges and the dry-merge read pin
`GIT_ATTR_SOURCE`, a git 2.40 feature, and the dry merge itself is
`merge-tree --write-tree`, git 2.38 — get it at https://git-scm.com) and, only
for commands that reach GitHub, the **GitHub CLI `gh` 2.0 or later, signed
in** (https://cli.github.com). A command that never touches a program never
demands it — `help` runs with neither installed. A program missing, too old
or not signed in is a named refusal on the error stream (`git-missing`,
`git-too-old`, `github-cli-missing`, `github-cli-too-old`,
`github-not-signed-in`): the program, the least version, what was found and
the program's official page — never an install attempt or instructions.
Checking a version costs one `git version` or `gh --version` per command,
only in commands that would run that program anyway; presence checks are
PATH lookups, never a spawned probe.

Run inside a Git checkout (or pass `--repo`) — `help` and `describe` work
anywhere; `help` prints the whole journey on one screen. `create` writes one folder and the
bounty's record; nothing else leaves the machine until `post` —
and `post` copies to a local folder you name or publishes the GitHub
listing. Every outcome is a
named state: refusals print
`refused (<name>)` and exit 3; usage errors exit 2; operational failures
exit 1. `--task` and `--note` are embedded verbatim, so a path the never-ship
rules would remove is refused (`never-ship-input`).

With one open bounty, omit its identifier: `bounty look 1`, `bounty apply 1`,
or `bounty status --comments`. With several, the refusal names them
so you can choose. `status <id>` shows what needs doing first. `--full` adds
the history and reports. A listing marks a solution as new the first time the
tool shows it, then as seen since that time. Seen means only that it was shown.

## Look at a solution

`look <id> <n>` collects pull request `<n>` itself — every check the old
`answer` command ran first, before anything is written — then prints the
change the solver made: the diff the pull request makes against
the commit the bounty named, computed on objects the tool already fetched.
When `<n>` names an attempt already collected it just shows it. `look
--from <dir>` does the same for a returned bounty folder.
Nothing is checked out, no folder is made and there is nothing to remove —
looking touches neither your working tree, index, branch nor configuration,
and the tool runs nothing of the solver's to print it. The printed lines are
marked as the solver's words, not the tool's, and the output names the next
command (`apply <n>` to choose that solution). A large change prints its list
of changed files first; `look <n> --full` prints the whole diff.

Because the diff is read off objects, what it shows is the form Git stores,
not the form your working tree shows (git-lfs pointers, git-crypt
ciphertext). Your filters apply only when the tool lands a merge on your own
working tree.

## Apply a solution

`apply <n>` collects like `look` when `<n>` names a pull request, merges a
clean solution and names `git revert -m 1 <merge>` — one ordinary commit —
as the way back, in the same output. On your
own working tree your filters apply as in plain Git: after a clean `apply`,
filtered files are in their working-tree form and `git status` is clean.

That same plain-Git behaviour is the one place your own configuration can
betray the boundary. A filter or merge driver whose command resolves inside
the repository is replaced by whatever the merge lands and then run; what a
program reads cannot be bounded, so an unchanged program that calls a file
the solution changes is the same risk. The check parses each line the way
Git will run it — through `sh -c` — so a program reached after a `|`, `;`,
`&&`, subshell or substitution is checked as a command of its own, while a
separator inside `'…'` or `"…"` is data, not a command. Once a program
places outside the tree, every operand that decides what executes must
itself place: a path operand inside the tree refuses, a bare operand that
resolves to a program is a program reached through an operand —
`find -exec`, `xargs`, `env`, `ssh <host> <cmd>`, `wsl` or `stdbuf`
operands, and every other program like them, are checked as command lines —
a bare operand that exists inside the tree refuses, and an option's own
value (`--use-compress-program=…`, `-I…` and spellings like them) is a word
the program reads, so it is checked the same way. A quoted operand that
holds a whole line is checked as a line; a quoted word without a space is
data. A bare interpreter such as `node` or `sh` configured as a filter runs
the filtered stream itself as its program, so it refuses; a `git`
program's arguments can reach an `alias.*` — including one injected by a
`-c` operand — so aliases are expanded, recursively, and an expansion that
cannot be fully placed refuses; a launcher like `npm`, `make`, `just`,
`task` or `rake` reads its program from a manifest in the working tree, so
it refuses unless a flag that names that launcher's manifest places the
file outside; and `include.path`, `includeIf` and `core.attributesFile`
values resolve against the file that sets them (`~` expanded), so an
include that lands inside the tree refuses wherever in the chain it sits.
Before the merge the tool reads
your configuration and refuses by name (`apply-unsafe-config`),
stating the configured command and the path
involved, when a command resolves inside the tree or cannot be placed
inside or outside it at all. Nothing is touched: working tree, index and
branch are exactly as before. The fix is yours — point the command at a
program outside the repository, or merge the solution with your own git.

When a solution clashes with current code, `apply` aborts the merge — the
worktree and index are exactly as before, the record keeps the conflicting
paths — and states the facts: which files clash, which of the solution's
files would merge cleanly, and which commits on this branch touched the
clashing files since the shared commit. It names `look <n>` so you can read
the solution before deciding what to do, and says once that a merge you make
yourself runs under the owner's own Git settings — the tool's pins are not
part of it.

Resolving a clash is your own merge — the tool offers no command that
merges, stages or resolves, and keeps no merge state of its own. However the
solution lands on the branch the bounty was created on — your own merge, the
pull request merged directly — the next bounty command that reads a record
recognises it by Git ancestry and ends the bounty exactly as a clean `apply`
does: the record goes `applied` with the landed commit named, the closing
comment and issue close go out, and the durability refs drop. A merge on any
other branch closes nothing and is never mentioned; if two solutions are on
the branch, the one merged first in its first-parent history is the one the
bounty names. A record that names no branch it was created on, or whose
branch is gone, cannot be checked — the command says so and nothing closes.
If the recognised merge carries a never-ship path the collected solution did
not, the path is named as a fact — the history stays as you made it.

## Solvers' questions

Status states the number of issue comments from accounts other than the
owner and the latest time, without displaying their words. `status
--comments` shows them with each line marked as written by another account,
not by the tool — the issue is bound to this bounty before anything is read
from it. Answering is your own `gh`: `gh issue comment <number> --body
"<your own words>"` — the tool no longer writes comments for you. Choosing
whether and what to answer is yours.

## Return to the job

Create automatically saves your branch, last commit and changed-file names
in the project's bounty record. `--resume "<short note>"` optionally records
what you were doing. This is private job context, distinct from the public
hand-off `--note <file>`. It is never copied into a bounty branch, issue or
comment. Status and the output after apply show it under
`Saved job context`. Older records say that this context was not recorded.
The automatic folder note stays in the local-folder hand-off; a new GitHub
history issue includes only an authored public `--note`, so filenames from
unfinished local work stay home too.

## Post and collect on GitHub

On GitHub, a bounty is an issue on the code that is already there — solvers
are told to branch from `box-bounty/<id>`, an ordinary branch based on the
newest commit the repository already had, and to send pull requests to it. The tool uses Git and `gh` already
signed in on the machine. Sign in through those programs, outside the tool. It
never asks for, reads, stores or prints a token. `origin` must have one fetch
destination and one push destination, both naming the same GitHub repository.
Before any push, the tool reads that exact repository's visibility and refuses
private or unreadable visibility.

For a prepared bounty, show exactly what becomes public before anything is
published:

```
node packages/box-cli/dist/cli.js bounty post <id> --to github --preview
```

This changes nothing. It asks the remote what it already has — fetched refs,
never a possibly-stale local tracking name — and prints:

- the commit the bounty branch is based on: the **newest commit on the current
  branch the GitHub repository already has**;
- what becomes public that was not: each unpushed commit with its identifier
  and subject, and — when the task is said to need uncommitted work — the
  tool's work-in-progress commit with the files it changes, adds and deletes;
  or `nothing new is published`;
- what stays home: uncommitted changes to tracked files that were not said to
  be needed, and every untracked file not named;
- never-ship-named paths that are already in the public history, as a fact —
  this tool cannot take back what is already public;
- the exact issue title and body a stranger will read.

Two choices, part of saying what the task is, and both visible in the preview:

- `--with-changes` — the task needs every uncommitted change to tracked files.
  They become **one** commit on the bounty branch, built by the tool through
  Git plumbing (`read-tree` + `update-index` + `write-tree` + `commit-tree`
  on a temporary index): the working tree, the index and the current branch
  never move, and the commit is deterministic — the preview, the record and
  the push name the same commit. Each file goes into the commit through the
  same clean filter a real `git add` would apply, so what publishes is the
  filtered form `create` would ship, never the working-tree bytes; a filter
  that cannot produce it is `github-filter-failed` and nothing is pushed.
  Without the flag they stay home; nothing
  publishes uncommitted work silently.
- `--include <file>` — an untracked file the task needs, named one flag per
  file. A name that resolves to a tracked file, a directory, a link, a path
  outside the repository, a missing file, a `.box/bounties/` record, or a
  never-ship path is a named refusal — untracked files are otherwise never
  published.

Never-ship holds on what is new: a change being published for the first time —
an unpushed commit or the work-in-progress commit — that touches a never-ship
path is refused (`github-never-ship`) and publishes nothing. A branch sharing
no commit with the remote has nothing public to point solvers at
(`github-no-public-base`); a local folder is still available.

Posting is gated once by the owner's decision, not per bounty — see *The
owner's one decision* below. With the tool allowed:

```
node packages/box-cli/dist/cli.js bounty post <id> --to github [--with-changes] [--include <file>]
```

Before the push, the pre-publish scan reads everything that would be
published for the first time — see *The pre-publish scan* below.
The retired project limits file grants nothing and is no longer read.
When nothing local was needed,
the branch is a name pointing at the existing commit and **zero file content
is uploaded**; otherwise only the new commits go up, identifiers unchanged.
The issue says the task, what was tried, the branch to branch from and the
commit it is based on, whether the branch carries the poster's work in progress
and how and how many commits, how to answer (fork, branch from the bounty branch,
pull request against it), the reward ($0) and the licence as a fact — and carries the
`box-bounty` label, created on the repository when missing. The issue address,
number and branch are kept in the local record and shown by `status` and the
open-bounties line.

The solver forks the repository (or pushes a branch inside it), works from the
bounty branch and opens a pull request against it in the same repository.
Collect from the project's record:

```
node packages/box-cli/dist/cli.js bounty status <id>
node packages/box-cli/dist/cli.js bounty look <id> <number>
```

`status` lists open pull request numbers, authors and changed files, and
reads the current issue state too, so a later
session learns about a new answer from the record alone. It saves the observed
outside state and its time; the open-bounties line carries those answer facts.
If GitHub cannot be reached, `github-status-unavailable` names that outcome,
shows the last recorded outside state and when, and names `status` as the retry.
`look <id> <number>` fetches the selected pull request's head without changing the
working tree, index or current branch (`--no-recurse-submodules`, so a carried
`.gitmodules` fetches nothing). Its target must be the recorded bounty branch
(`github-pr-wrong-branch`), its history must descend from the bounty branch's
tip (`github-pr-not-descended`) — there is nothing sound to compare it with
otherwise — the remote branch must still be where the tool left it
(`github-branch-changed`), its tree must hold no link, submodule or unsafe
name (`answer-unsafe-path`), and no commit it introduces may touch a
never-ship path (`answer-never-ship`) — a path planted deep in the history and
removed in the last commit still cannot land. A pull request that changes
nothing is `answer-empty`.

The report is computed with Git from the real history: the account and the
time, the commit count, files changed/added/deleted with line counts, whether
it merges cleanly onto the current branch and which paths clash if not (read
through `git merge-tree`, so the worktree and index never move), the stated
flags, and the sentence that nothing was run. `apply <id> <n>` is an ordinary
`git merge` of the pull request's commits onto the current branch — one merge
commit naming the bounty and the attempt — under the same working-tree
protections every merge has. `git revert -m 1 <merge>` reverses it whenever
you like; no tool command is needed.

**An answer from any account can be collected and applied.** The author is
recorded on the attempt as a fact — a GitHub-shaped login, nothing more — and
nothing it wrote is ever run: the fetch pulls objects only, the report reads
them, and `apply` pins attribute lookups to the owner's own tree and reads
hooks from an empty directory, so a returned `.gitattributes`, a merge driver,
a hook or a submodule declaration names no command on this host. Applying is
still a decision, not a consequence — `apply <id> <n>` is always the agent's
call.

`apply` and `close` comment the recorded fact on the issue, close it
and remove the bounty branch — a merge the next command recognises on the
bounty's branch does the same, naming the solution and the commit. If the branch carried work published only there —
the poster's unpushed commits or the work-in-progress commit — the issue names
those commits before the branch is removed, so nothing the agent published is
lost by surprise; the local work was never touched. If an outside step fails, the local decision stands and the record
names `github-decision-pending` and `close` as the command to retry. That retry resumes
outside work without repeating the local merge. `status` shows pending
work even after a bounty has ended. A `close` after an unfinished apply update
preserves both facts and finishes the issue closure and branch removal. Retry
uses the account that started the post; comments or copied listings from other
accounts cannot stand in for tool facts.

If a push succeeds but the issue cannot be opened, the refusal is
`github-post-incomplete`. The record states the known outside state. Repeat
`post <id> --to github` to finish; it recovers an issue whose response was lost
and never creates a second listing. To remove a partial post instead, run
`close <id>`. Nothing here sends money or posts to a bounty site.
Closing also finds and closes a successfully created issue whose response
was lost, before it clears the outside work.

Records posted before the bounty became an issue on real history — a
parentless snapshot commit on the branch — still load: `status` marks them
`snapshot-posted`, and a still-open one can be collected and closed the old
way. The local-folder post and answer path is unchanged and still uses the
snapshot.

## The owner's one decision

Posting, merging and closing need no approval once the owner has allowed the
tool — that is what the tool is for, and a separate approval for each would
show a control the tool does not have: an agent with Git and `gh` could do
any of it by itself. One decision remains, made once: *"my agents may use
this tool."*

The decision is kept in the owner's own settings folder on this machine,
**outside every repository** — never committed, never cloned, out of reach
of a solution, a pull request or a collaborator:

- Windows: `%APPDATA%\box\settings.json`
- elsewhere: `$XDG_CONFIG_HOME/box/settings.json`, or `~/.config/box/settings.json`
- tests and fixtures point `BOX_BOUNTY_SETTINGS_DIR` at a temporary folder.

A repository entry is keyed by its GitHub address, owner/name, with letter
case and a trailing .git normalized. Every copy on this machine is covered.
A fork, or another repository at the same folder path, is a different entry.
All fetch and push addresses must name one GitHub repository. A Git URL
rewrite that changes that destination refuses before permission or posting.
Remote names can change without changing the repository's identity.

The owner has three words:

- `allow [owner/name]` adds a repository. Without a name it adds this
  repository. The disclosure says bounties are public under the owner's
  GitHub account, solutions the agent chooses are merged into the owner's
  code, and this decision covers this repository only. `--ask` means be
  asked each time before publishing.
- `deny [owner/name]` removes the active entry. Open bounties are untouched.
  Its dated removal stays in the settings history and blocks the all-projects
  default for that repository. Config shows 'not allowed; denied at' and the
  exact command to re-allow it. Re-allow clears the exception.
- Bare `config` prints all settings, set or not, with the command that changes
  each one. `config set all-projects true` allows all projects, except dated
  deny exceptions. It is off by default. `false` turns that default off;
  `ask` asks before publishing in projects with no entry.
  `config add repositories owner/name` and `config remove repositories
  owner/name` change the same list as allow and deny.

Nothing written grants nothing. A repository entry overrides the default.
Every change retains the previous value and its time. Legacy folder entries
are moved once to the single readable GitHub address at that path. Unreadable
or ambiguous paths are reported with a re-add command and grant nothing at
that path, even under an old blanket default. If two old paths have conflicting
decisions for the same address, that address stays not allowed until a new
decision. Migration notices and the old decision history remain visible.

Ask me each time covers publishing and nothing else. Merging is not gated.
The tool closes a bounty whose solution was merged without asking, in every
mode. `allow <waiting-bounty-id>` posts that waiting bounty immediately and
changes no repository permission. The first-use message offers, in order,
allow this repository, be asked each time before publishing, and this one
bounty only. Bare config uses the same choices. All-projects is not offered
at first use. A later post says if the owner previously chose one bounty only.

Waiting is a successful command outcome with exit status 0. No command waits
for typed input, and retrying a held post keeps its first waiting time. The
owner's permission is checked before any GitHub call; a first post still
waits if gh is absent. Allowed posts still require public repository visibility
and a signed-in GitHub account. A post under the all-projects setting says so.

The first merge of a stranger's solution asks the agent to tell the owner in
its closing message, naming the merge commit. It is a notice, never a question,
recorded once per receiving repository and shown by status. The receiving
repository's current GitHub address identifies that notice, even when the
bounty was published elsewhere. Without a usable address, the notice is
recorded locally in `.box/bounties/FIRST_MERGE` and names the local repository.
A recorded local notice still counts if a GitHub address is later added.
It grants no publication permission. `status --since <iso>`
also prints the bounties posted, solutions merged and bounties closed since
that time, plus what is waiting now. The seven old owner spellings are named
refusals with their replacements, never aliases.

**This is protection, not a lock.** The file sits where the owner's own
programs can write it; an agent that sets out to edit a file it can reach —
or to point `BOX_BOUNTY_SETTINGS_DIR` at a folder it made — could post the
same things with its own Git anyway. What the file does is stop accidents
and make every change visible with a time. It does not pretend to be a
cryptographic boundary.

A malformed settings file, or a name the tool does not know, is a named
refusal (`settings-malformed`, `settings-unknown-name`) — refused, never
ignored, on every command that reads it. A name that reaches for a hard stop
(`settings-hard-stop`) is refused the same way: **the three hard stops —
never-ship files, a private repository, the owner's standing rules — cannot
be expressed as settings or switched off by one.**

## The pre-publish scan

Because nobody sees a preview any more, everything a GitHub post would
publish **for the first time** is scanned for secret-shaped content before
it goes out: the added lines of each commit not yet pushed, the tool's
work-in-progress commit when `--with-changes` is chosen, and every untracked
file `--include` names. `create` previews the same scan over what would
leave — the shipped set is what a folder post publishes and a superset of
what a GitHub post publishes for the first time — so the agent can fix a
hit before `post`; a hit at `create` holds nothing and is recorded the same
way. The patterns are a small stated list, not proof of absence:

- private key blocks (`-----BEGIN … PRIVATE KEY-----`);
- well-known token and key formats (GitHub, GitLab, AWS, Slack, OpenAI,
  Google API keys, and the like);
- connection strings carrying a password (a `postgres://` URL whose
  credentials section contains `user:password@`, `Password=…` and the
  like);
- a long random-looking string assigned to a name such as `key`, `secret`,
  `token` or `password` — quoted or the bare `NAME=value` env spelling.

Ordinary code that uses the words `token` or `key` — short values, obvious
placeholders, a getter call — does not match. Stated limits of the same
kind: a token split across lines is not caught, a key block wrapped
differently (say, base64) is not caught, and **a file Git treats as binary
is not scanned at all** — the preview and the post name such files as not
scanned, which is a fact, never a hold; the owner's `never publish` list is
how such a path is kept out.

A hit makes **that one bounty** wait for the owner in a named waiting
state, naming the file and line — and the commit when the content sits in
one not yet pushed, since an ordinary push would publish it too — **never
printing the value**. The hold is recorded on the record: what was flagged
and what happened — and it stays in `status` (bare, `status <id>` and
`--full`) after the bounty ends. The record claims only what was verified:
a GitHub post ran the scan again, so it can say the flagged content changed
or sits on `safe to publish`; a folder post runs no scan, so a finding
settled that way says the flagged content went out without being
re-checked. The agent's own moves are to remove the flagged content
and post again — that sends the bounty — or to stop it; the hit message
offers no owner command, because no owner answer can release a scan hold:
`allow <id>` on one is a named refusal (`allow-scan-held`). The owner
decides in `config` on two lists that live only in the owner's settings
outside the repository:

- **`safe to publish`** — `config add safe-to-publish <path>` lists paths
  the scan does not hold a bounty over, for known false alarms (a fixture
  with a made-up key). A safe-listed path still cannot carry a never-ship
  file — the rule keeps it out whatever the list says, and naming a
  never-ship path safe is refused (`publish-list-never-ship`).
- **`never publish`** — `config add never-publish <path>` is the owner's
  own addition to the never-ship table: a listed path is kept out of every
  bounty — snapshot, first-published commit, named file, returned solution.

Entries are repository-relative paths validated before the write: a path
resolving outside the repository or through a link is refused
(`publish-list-outside`, `publish-list-link`), and a project file that
claims either list is refused by name and grants nothing
(`project-claims-list`) — a solution must never widen what a bounty can
carry. `config` shows both lists and the commands that change them.

Waiting for the owner **cannot be enforced** — the owner may not act, and
content reworked until the scan passes goes out. What the tool guarantees
is that the owner is told every time, in `status` and `config`, and can
read what was published. An owner's `allow <id>` remains how permission
waits are answered — bound to what the owner was shown would be published:
if the base, the commits published for the first time, the work in
progress, the included files or what stays home changes afterwards, the
answer does not carry over (`github-preview-stale`); the tool's own
bookkeeping does not count as a change. An answer clears only what the
recorded wait named: a post held for the decision alone still runs its
scan. No setting switches the scan off — it is a protection of the owner's,
like never-ship, not a judgement on the agent.

`create` asks only for judgement — a task and one line of why; everything
else has a default:

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

`box bounty` prints the cold-session overview: open work, solutions needing
attention and the next command. A solution already shown but not decided
includes its age. `describe` explains what the tool does and when it is worth
using, then generates cost and wait facts from the project records each time.
GitHub posting is public and free, and every bounty states a $0 reward.
With no past posted bounty it says there is no history yet. Otherwise it
reports waits from the recorded posting time to the first recorded solution
observation and how many ended posted bounties had
a solution merged. Past waits do not predict the next answer.

### Existing instruction files

`box bounty config` lists the instruction files found now. The known list,
confirmed against official documentation on 13 October 2026, is:

| Host | Files | Loading condition |
| --- | --- | --- |
| [Codex](https://developers.openai.com/codex/guides/agents-md) | `AGENTS.md`, `AGENTS.override.md` | The override takes precedence in a directory. |
| [Claude Code](https://code.claude.com/docs/en/memory) | `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md` | Project instructions loaded at startup. |
| [Cursor](https://cursor.com/docs/rules) | Existing `.mdc` files under `.cursor/rules` | Only `alwaysApply: true` guarantees every chat; other rules are conditional. |
| [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/) | `GEMINI.md` | Default workspace context filename. |
| [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions) | `.github/copilot-instructions.md` | Repository instructions for supported enabled features. |

Discovery checks these project-root files and existing rule files on every
invocation. It stores no discovered file list. Nested or differently named
instruction files can be selected explicitly. The owner enables maintenance
once for this checkout with:

```text
box bounty config set instructions true
```

This adds one identical block to each existing file found. It creates no
instruction file and changes no original bytes outside its marked block.
Front matter, other tools' blocks and line endings outside the block stay as
they were. A damaged block, a link or an unsafe path is a named refusal for
that file; other safe files still update. The registry declares which files
support documented `@relative/path` imports. In those files, inline references
outside Markdown code spans and code blocks keep the block in the imported
file once. Ordinary references in files without import support do not suppress
their block. Imports are resolved relative to the importing file.
The importer names that fact in config output. Cyclic imports are refused.

For any other host or custom filename, choose an existing file inside the
checkout, then enable maintenance:

```text
box bounty config set instruction-file path/to/instructions.txt
box bounty config set instructions true
```

The maintenance choice and optional custom file live in the owner's
`settings.json` outside the repository. They grant no publication permission.
`box bounty config set instructions false` stops maintenance and keeps existing
blocks. A newly appearing instruction file gets a once-only notice from
`status`, with the command to add the block; nothing adds it automatically.
Private notice acknowledgements store hashes, not a discovery list.

The block says the tool exists and points to `box bounty describe`. With
nothing open it has no activity line. With open work it says exactly
`a bounty is open; \x60box bounty\x60 shows more.` With a new solution it says
`a bounty has a new solution; \x60box bounty\x60 shows more.` New means no agent
in this project has been shown it. Once shown, the first wording returns.
No count, identifier, title, account, branch, stage or foreign text enters
the block. Its canonical bytes use LF in every file.

These lines are only as fresh as the last time the tool looked at GitHub.
Nothing runs in the background. The detailed local listing in
`.box/bounties/OPEN` remains separate from the instruction block.
`describe --rules` prints the current fixed block as a template.

### Awareness at fixed moments — the hook

An agent that forgets to run `status` still misses arrivals. On hosts that
run a command at fixed moments, the owner can switch on the hook:
`box bounty hook on --host <devin|claude>` prints a complete disclosure —
what the entries run, which files they read and write, what the context
costs, what may follow (including that a recognised merged solution closes
the GitHub issue with a comment and nobody is asked, while publication is
allowed), what it never does and how to stop it — and writes nothing until
the same command is repeated with `--confirm`. `box bounty hook` reports
per-host state; `box bounty hook off --host <name>` removes exactly the
entries it wrote and restores the settings file byte for byte.

The entries the hook installs call one shared command, `box bounty hook
start|pause|finish`, at the host's start, next-prompt and finishing slots:

- **start** shows the open-bounty state on one line — ids, stages, counts —
  and nothing when no bounty is open;
- **pause** and **finish** announce what arrived during the session, once
  each — a new solution, and at finish a merge conflict still waiting;
- every other moment the command prints nothing at all.

The agent's context only ever carries tool-generated facts — never a title,
account name, branch name or issue body a stranger chose. What was already
announced is kept in `.box/bounties/`'s sibling `.box/hook-told.json`, so an
event is announced once across sessions, and `.box/hook-on.json` records
what `hook on` created so `hook off` restores the file exactly. GitHub is
asked at most once every five minutes while an open bounty is posted
there, each call capped at eight seconds, and one run's calls bounded to
eight calls inside twenty seconds — a GitHub that paginates or hangs
cannot hold a session — and the host entry itself times out — a hook
never blocks a session, waits for input or exits non-zero.
Reading records recognises a merged solution as any record read does, so
under the standing rules the hook can close a GitHub bounty with a comment
and nobody asked — the disclosure says so before anything is written.

Host support is limited to the hosts whose hook format was verified against
installed documentation on this machine: Devin CLI (`.devin/hooks.v1.json`)
and the Claude Code settings format (`.claude/settings.json`). A session
actually firing these entries was not live-proven on this machine — the
wiring is written to the documented format, nothing more.

### Retired project limits

`.box/limits.json` is no longer read, rewritten or deleted, even if malformed.
The tool reports its presence once and says it can be deleted. If you used
`rulesFile`, re-enable maintenance and re-select any custom file using the
commands above. `allowedDestinations` and `reminders` are dropped; `cost` and
`expectedAnswer` now come from facts. Everything the owner configures lives
in the owner's settings outside the repository.

## The record — the bounty outlives the agent

`create` also writes `.box/bounties/<id>.json` inside the repository and prints
its path. The tool writes the file; committing it is the agent's normal flow.
The record holds the id, title, the snapshot identifier
(commit + tree + base), the absolute path of the bounty folder, and the stage
history — one event appended per transition, never rewritten:

```
drafted → posted → taken → answered → applied
    ↘ waiting — an action held for the owner: the first post with nothing
      written or "ask each time" written, a post held by the pre-publish
      scan or a named untracked file, an outside close held under
      "ask each time"
(ended early: rejected, withdrawn, expired;
 an applied merge is reversed with ordinary git — the record
 stays applied; older records carry `confirmed` and `undone`
 stages and still load — a `confirmed` record's written yes
 stands and the bounty posts)
```

`answered` is a waiting stage, not an ending: every answer lands there —
nothing is run and nothing is merged until `apply` runs — and an answer that
is not chosen does not end the bounty either; it stays a numbered **attempt**
while more can come back. Every answer is kept: `record.attempts[]` holds
each one's commit, change, outcome, conflict paths and report; `status` lists
them all. Records written before attempts existed — a single `answer` on the
record — load as attempt number 1 and still apply.

Records written while checks existed still load. They carry a `level` and
check outcomes (`verified`, `check-failed`, `check-unrunnable`,
`check-not-run`); `status` prints each as the history it is — "the declared
check exited 0 on it (checks were removed on 11 October 2026)" — never as a
promise about the current code, and no new record writes a level.

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
`rejected`, `withdrawn`, and `undone` on older records — removes them all.

## The commands after create

- **`help`** prints the whole journey on one screen — the stages, what each
  command does in one line, and what ends a bounty. It reads no repository,
  so it works outside a checkout too. A bare `box bounty` is a usage error
  pointing at it; an unknown verb is named in the message.
- **`status`** lists every open bounty with id, title, stage and the next step —
  and never prints nothing: an empty `.box/bounties/` says so and says what to
  do. Ended bounties are one compact line.
- **`post <id> --to <dir|github>`** is the first delivery, and it is gated
  once by the owner's decision: nothing written → `owner-allow-needed` (the
  post waits, and prints the few lines to put to the owner); "ask me each
  time" or "off" written → `owner-answer-needed`. The recorded folder gone →
  `folder-missing`; its
  `bounty.json` naming a different id → `folder-mismatch`; the destination
  inside the repository → `destination-inside-repo`; `<dir>/<id>` already
  existing → `destination-exists`. On success it **copies** the bounty folder to
  `<dir>/<id>/` (the recorded folder stays) or publishes the GitHub issue,
  and marks the bounty `posted` with the destination and which of the
  owner's written answers allowed it.
- **`look <id> (<n> | --from <dir>)`** collects a pull request by number, or a
  returned bounty folder with `--from` — see *The answer comes back* below —
  then shows the change. An `<n>` already collected just shows it.
- **`apply <id> [<n> | --from <dir>]`** merges a recorded attempt onto the
  current code — collecting first, exactly as `look` does, when `<n>` names a
  pull request or `--from` a returned folder. With one applicable attempt no
  number is needed; with more than one,
  `apply` refuses by name (`apply-ambiguous`) and prints the attempt numbers —
  pass one as `<n>` (`unknown-attempt` otherwise). On any other stage it
  is a named refusal (`wrong-stage`, `already-ended`).
- **`close <id> [--reason "<text>"]`** ends a bounty with nothing merged:
  with `--reason` the record lands `rejected` and keeps the reason; without
  one it lands `withdrawn` — on any open stage, including a draft. Either way
  the durability refs are removed, and repeating it is a named state, not an
  error: an ended bounty reports `already-ended` and retries whatever outside
  work is still owed. An empty `--reason` is `missing-reason`; an unknown id
  is `unknown-bounty` everywhere.
- **reversing an apply is plain Git** — `git revert -m 1 <merge>`, the merge
  being one ordinary commit. There is no `undo` command.
- **`hook`** reports whether the awareness hook is on for each known host.
  **`hook on --host <name>`** prints the disclosure and changes nothing until
  `--confirm`; **`hook off --host <name>`** removes the entries it wrote.
  `hook start|pause|finish` is the shared command the host entries call —
  silent with nothing to say, exit 0 always. See *Awareness at fixed
  moments* above.

## The answer comes back

The solver hands back the **whole bounty folder**: the original `bounty.json`
plus a `repo/` they edited — nothing else to write, no diff format to learn.
`look <id> --from <dir>` (or `apply <id> --from <dir>`) binds it before
anything runs:

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

**`answer` reports facts, never a verdict.** A wrong fact is a bug we can
find; a wrong verdict misleads and cannot be traced — so the report is policed:
no "correct", "safe", "good", "recommended", "should accept" or
"should reject", in any outcome, and a test keeps it that way. The report
states only what was observed:

- `report — attempt <n> for <id>` — which answer this is;
- `from:` — who sent it (a GitHub account name, or "a returned folder") and
  when it arrived;
- `change:` — changed/added/deleted path counts and lines added/removed;
- `current code:` — a dry merge read (`git merge-tree --write-tree`) of the
  answer against the current branch, with the conflict paths when it would not
  land — the worktree, index and `HEAD` never move for the read;
- `flag:` lines — eager observations, never blocks: the answer touches a file
  the stated rule marks as a test; files were added or deleted; the change is
  above the stated size;
- one always-present sentence — `nothing in the solution was run and this
  report says nothing about whether it works`;
- `next:` — the exact next command.

Every answer lands at `answered` and **stops** — nothing is merged; `box
bounty apply <id>` is the recorded decision, or `close <id> --reason "<why>"`
ends the bounty with its reason. More answers are attempts 2, 3, … and `status` lists them all.
When several attempts could apply, `apply` names them (`apply-ambiguous`) and
`apply <id> <n>` picks one — any attempt may be named, whichever account it
came from.

**Applying is a real git merge, never a file write.** The change becomes a
commit on the snapshot's base commit — the base tree plus the extracted delta
(built on a temporary index — the worktree and real index are never touched),
so the incoming side of the merge is the solver's change alone — and
`git merge` brings it onto the current branch as a merge commit whose message
names the bounty and the attempt. A conflict aborts the merge — the worktree
and index come back byte-identical — and the record keeps its stage with the
conflicting paths as the next step; fix them, commit, and `apply` retries, or
`close <id> --reason "<why>"` ends it. Work the merge would overwrite is refused by name
(`apply-worktree-dirty`) before it can run — uncommitted content on a touched
path, and any file that exists at a touched path but is not in the index (an
ignored file the merge would silently clobber) — never damaged. Applying one
attempt ends the bounty and removes every answer ref.

## Reversing an apply

The merge `apply` makes is one ordinary commit on the current branch, naming
the bounty — `git revert -m 1 <merge>` reverses it as a new commit whenever
you like, under your own Git settings. The tool has no `undo` command; a
revert is history you own, not a bounty transition, so the record stays
`applied` and the bounty stays ended.

## The note writes itself

Without `--note`, `create` composes the hand-off note from evidence it
gathers itself: the files the working state already changed
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
to report — a clean tree — gets a plain note saying so. `--note`
still wins when given.

## What the folder contains

```
<out>/
  README.md      the listing: what is wanted, what was already tried, where the
                 code is, what was kept out, how to answer, the reward ($0) and
                 the licence fact — enough for a stranger to act on
  bounty.json    the manifest: id, title, task, note, the licence fact, the
                 snapshot identifier, every shipped file's sha256 + bytes,
                 totals, and the never-ship rules that applied with removal
                 counts (no names) — it carries no command
  repo/…         the snapshot: the repository as it stands — tracked files with
                 uncommitted changes plus untracked files that are not ignored;
                 no .git, no history
```

## The preview

Before anything is written the command prints exactly what would leave: file and
byte counts, which never-ship rules removed how many files (locally the removed
names are listed), the task and the destination.
`--preview` prints that and writes nothing — except the snapshot objects: the
preview is computed from the recorded commit, so it already exists unreferenced
in `.git/objects` when the preview returns.

## Checks were removed

On 11 October 2026 the owner removed checks from the tool: a bounty is the
task, what was tried, the why and the code, and judging a solution is the
agent's or the owner's work — never the tool's. `--setup`, `--check` and
`--guard` are each refused by name (`checks-removed`) so an agent reusing an
old command line learns why; the `mechanical`/`reviewed` level is gone with
them, from the manifest, the record and the listing. Manifests and records
written before that day keep their keys on disk and still load — readers
ignore what no longer exists, and an old record's check outcome is printed as
dated history, not as anything about the current code.

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

The snapshot commit is made the way your own commit would be: a clean filter
you configured (git-lfs, git-crypt) runs, so the commit holds what Git stores
for each file — a pointer, a ciphertext — never the working-tree form. The
bytes in `repo/` are read back **from that commit**, not from the working
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

**Limit:** never-ship matches names, not contents — a secret inside an
ordinary-looking file name still ships. The pre-publish scan (above) catches
secret-shaped content only in what a GitHub post publishes for the first
time; a local-folder bounty ships the snapshot unchecked, and `.boxignore`
is the catch-all for those — plus the owner's `never publish` settings list,
which joins this same table from outside the repository.
